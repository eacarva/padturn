#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod hid;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[tauri::command(async)]
fn present() -> bool {
    hid::present()
}

#[tauri::command(async)]
fn read_all() -> Result<hid::Snapshot, String> {
    hid::Kb::open()?.read_all()
}

/// Before every write the current keyboard state is saved to <app data>/backups, so nothing is ever lost.
#[tauri::command(async)]
fn write_entries(app: tauri::AppHandle, entries: Vec<Vec<u8>>, leds: Vec<(u8, hid::Led)>) -> Result<hid::Snapshot, String> {
    let kb = hid::Kb::open()?;
    let before = kb.read_all()?;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs();
    let json = serde_json::to_string(&before).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("antes-de-gravar-{stamp}.json")), json)
        .map_err(|e| format!("Não consegui salvar o backup automático; nada foi gravado. ({e})"))?;
    kb.write_all(&entries, &leds)?;
    kb.read_all()
}

#[tauri::command]
fn backups_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("backups").to_string_lossy().into())
}

#[tauri::command(async)]
fn save_backup(app: tauri::AppHandle, json: String) -> Result<bool, String> {
    let Some(path) = app.dialog().file().set_file_name("backup-teclado.json")
        .add_filter("JSON", &["json"]).blocking_save_file() else { return Ok(false) };
    std::fs::write(path.into_path().map_err(|e| e.to_string())?, json).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command(async)]
fn open_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(path) = app.dialog().file().add_filter("JSON", &["json"]).blocking_pick_file() else { return Ok(None) };
    std::fs::read_to_string(path.into_path().map_err(|e| e.to_string())?).map(Some).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![present, read_all, write_entries, backups_dir, save_backup, open_backup])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Padturn");
}
