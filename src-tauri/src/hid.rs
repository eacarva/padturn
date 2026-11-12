//! Config interface (vendor usage page 0xFF00) of the MINI-KEYBOARD family.
//! Protocol reverse-engineered from the vendor's MINI_KEYBOARD.app (firmware >= 10 path);
//! 65-byte output reports, report ID 3:
//!   03 FB FB FB              -> reply 03 FB keys knobs firmware
//!   03 FA count 00 layer     -> `count` replies: 03 FA idx layer type flag n 00 00 items(3 bytes each)
//!   03 FD idx layer ...      -> write one entry (same layout as the reply)
//!   03 FD FE FF              -> commit key entries to flash (vendor waits 1 s)
//!   03 FA B0 layer-1         -> LED reply: 03 FA mode rgb[16*3]   (LED layers are 0-based)
//!   03 FE B0 layer-1 mode rgb[16*3] -> write LED of one layer

use hidapi::{HidApi, HidDevice};
use serde::{Deserialize, Serialize};
use std::{thread, time::Duration};

const VENDORS: [u16; 2] = [0x514C, 0x1189];
pub const ENTRIES: usize = 25; // the vendor app always asks for 25 entries per layer
pub const LED_BYTES: usize = 48; // 16 RGB triples (keys + knob rings)

#[derive(Serialize, Deserialize, Clone)]
pub struct Led {
    pub mode: u8,
    pub rgb: Vec<u8>,
}

#[derive(Serialize)]
pub struct Snapshot {
    keys: u8,
    knobs: u8,
    firmware: u8,
    layers: Vec<Vec<Vec<u8>>>, // [layer 1..3][entry 1..25] -> 64 bytes
    leds: Vec<Option<Led>>,    // [layer 1..3]; None when the model has no LEDs
}

pub struct Kb(HidDevice);

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

impl Kb {
    pub fn open() -> Result<Self, String> {
        let api = HidApi::new().map_err(err)?;
        let info = api
            .device_list()
            .find(|d| VENDORS.contains(&d.vendor_id()) && d.usage_page() == 0xFF00)
            .ok_or("Teclado não encontrado. Conecte pelo cabo USB (pelo Bluetooth não dá para configurar).")?;
        let dev = info
            .open_device(&api)
            .map_err(|_| "O teclado está em uso por outro programa. Feche o MINI_KEYBOARD e tente de novo.".to_string())?;
        Ok(Kb(dev))
    }

    fn send(&self, bytes: &[u8]) -> Result<(), String> {
        let mut p = [0u8; 65];
        p[..bytes.len()].copy_from_slice(bytes);
        self.0.write(&p).map(|_| ()).map_err(err)
    }

    fn recv(&self) -> Result<Vec<u8>, String> {
        let mut r = [0u8; 64];
        match self.0.read_timeout(&mut r, 1500).map_err(err)? {
            0 => Err("O teclado não respondeu.".into()),
            n => Ok(r[..n].to_vec()),
        }
    }

    fn read_led(&self, layer: u8) -> Option<Led> {
        self.send(&[3, 0xFA, 0xB0, layer - 1]).ok()?;
        let mut r = [0u8; 64];
        let n = self.0.read_timeout(&mut r, 400).ok()?;
        (n >= 3 + LED_BYTES && r[0] == 3 && r[1] == 0xFA).then(|| Led { mode: r[2], rgb: r[3..3 + LED_BYTES].to_vec() })
    }

    pub fn read_all(&self) -> Result<Snapshot, String> {
        self.send(&[3, 0xFB, 0xFB, 0xFB])?;
        let i = self.recv()?;
        if i.len() < 5 || i[0] != 3 || i[1] != 0xFB {
            return Err("Resposta inesperada do teclado.".into());
        }
        if i[4] < 10 {
            return Err(format!("Firmware {} ainda não é suportado pelo Padturn (precisa ser 10 ou mais).", i[4]));
        }
        let mut layers = vec![];
        for layer in 1..=3u8 {
            self.send(&[3, 0xFA, ENTRIES as u8, 0, layer])?;
            let mut rows = vec![];
            for idx in 1..=ENTRIES as u8 {
                let r = self.recv()?;
                if r.len() != 64 || r[0] != 3 || r[1] != 0xFA || r[2] != idx || r[3] != layer {
                    return Err("Resposta inesperada do teclado.".into());
                }
                rows.push(r);
            }
            layers.push(rows);
        }
        let leds = (1..=3).map(|l| self.read_led(l)).collect();
        Ok(Snapshot { keys: i[2], knobs: i[3], firmware: i[4], layers, leds })
    }

    /// Validates everything first, then writes key entries (+ commit) and LED layers.
    pub fn write_all(&self, entries: &[Vec<u8>], leds: &[(u8, Led)]) -> Result<(), String> {
        let entries_ok = entries
            .iter()
            .all(|e| e.len() == 64 && e[0] == 3 && (1..=ENTRIES as u8).contains(&e[2]) && (1..=3).contains(&e[3]));
        let leds_ok = leds.iter().all(|(l, d)| (1..=3).contains(l) && d.rgb.len() == LED_BYTES && d.mode < 16);
        if !entries_ok || !leds_ok {
            return Err("Dados inválidos; nada foi gravado.".into());
        }
        for e in entries {
            let mut p = e.clone();
            p[1] = 0xFD;
            self.send(&p)?;
        }
        if !entries.is_empty() {
            self.send(&[3, 0xFD, 0xFE, 0xFF])?;
            thread::sleep(Duration::from_secs(1)); // the vendor app waits 1 s for the flash write
        }
        for (layer, d) in leds {
            let mut p = vec![3, 0xFE, 0xB0, layer - 1, d.mode];
            p.extend_from_slice(&d.rgb);
            self.send(&p)?;
        }
        Ok(())
    }
}
