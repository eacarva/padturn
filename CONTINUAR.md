# Padturn — como continuar

Padturn substitui o app do fabricante MINI_KEYBOARD (mini teclado com 12 teclas e 4 knobs, VID 0x514C).
É feito em Tauri v2: Rust no `src-tauri/` e HTML/JS sem framework no `ui/`. Roda em Mac e Windows.

Para retomar com o Claude, abra uma sessão nesta pasta e diga:
"leia CONTINUAR.md e ESPECIFICACAO.md e continue".

## Onde está cada coisa

| Caminho | O que é |
|---|---|
| `ESPECIFICACAO.md` | Protocolo HID, tipos de ação, luz, modelos e telas do app original (engenharia reversa) |
| `src-tauri/src/hid.rs` | Comunicação com o teclado: ler, gravar, commit `03 FD FE FF`, luz |
| `src-tauri/src/main.rs` | Comandos. Faz o backup automático antes de gravar, em `<app data>/backups/antes-de-gravar-*.json` |
| `ui/model.js` | Converte os bytes de cada entrada em ação e a ação de volta em bytes |
| `ui/layouts.js` | Desenho de cada modelo (12+4 medido do original; os outros são calculados) |
| `ui/app.js`, `ui/style.css`, `ui/index.html` | Interface |
| `ui/*.test.mjs` | Testes: `node ui/model.test.mjs && node ui/layouts.test.mjs` |
| `backups/backup-teclado-original.json` | Configuração original das 3 camadas (só teclas, sem luz) |
| `re/decomp.c` | App original decompilado com Ghidra (102 funções; `re/idx.txt` é o índice por linha) |
| `re/tools/q.py` | Script Python para mandar comandos HID na mão (feche o Padturn e o MINI_KEYBOARD antes) |
| `re/vendor-images/` | Imagens extraídas do app original |
| `design/`, `app-icon.png`, `icon.svg` | Ícone aprovado: opção F, "knob na tecla" |

## Build

```bash
npm install
export PATH=$HOME/.cargo/bin:$PATH
npx tauri build --bundles app
open src-tauri/target/release/bundle/macos/Padturn.app
```

- **Windows:** o código compila para `x86_64-pc-windows-msvc`. O instalador precisa ser gerado no Windows (`npx tauri build`) ou num CI.
  - A ideia é usar Azure Pipelines, para manter o repositório privado sem gastar minutos do GitHub. O YAML ainda não foi escrito.
- **Regra:** o app MINI_KEYBOARD prende o teclado. Feche-o antes de usar o Padturn.

## Estado (2026-11-12)

### Funciona e foi conferido

- Leitura das 3 camadas, dos knobs e das cores.
- Desenho girável. O usuário usa o teclado de cabeça para baixo (180°).
- Posição dos knobs conferida com os knobs físicos.
- Captura de tecla real (inclusive numpad e modificadores direitos F5–F8) e teclado virtual com layout real.
- Mídia, mouse/gestos e macro com atrasos.
- Destaque ao vivo da tecla ou knob apertado.
- Backup: exportar, restaurar e backup automático antes de gravar.

### Pendente, em ordem

1. **Teste de gravação no hardware.**
   - Passo a passo: camada 3, tecla 1 (vazia) → F13 → Gravar → conferir o backup automático e o status "Gravado e conferido" → voltar a tecla para Nada → Gravar → comparar com `backups/backup-teclado-original.json`.
   - Resultado: ver a seção "Teste de gravação" no fim deste arquivo.
2. **Luz da camada 1.**
   - O usuário apagou as cores no app original, mas o Padturn mostra cores.
   - Lido do teclado: camada 1 = modo 2 com uma paleta arco-íris; camadas 2 e 3 = modo 1 com cor fixa.
   - Hipótese: só um dos modos usa as cores por tecla, e o modo 2 deve ser "apagado". Os botões no original se chamam `LED_Mode_0`..`LED_Mode_5`.
   - Como confirmar os nomes: abrir a aba RGB LED do MINI_KEYBOARD e comparar com `Widget::Read_RgbLed_DataDsp` em `re/decomp.c`.
   - Correção no Padturn:
     - Dar nome a cada modo, por exemplo "Apagado".
     - Só mostrar a cor por tecla no modo que a usa.
3. **Gravação de luz** (`03 FE B0 camada-1 modo rgb[48]`): não testada.
4. **Outros modelos.** O desenho e a ordem dos knobs fora do 12+4 são um palpite. O destaque ao vivo confirma quando alguém tiver um desses modelos.
5. **CI e instalador do Windows.**

## Regras do usuário

- Nunca gravar no teclado sem backup funcionando e sem autorização.
- Mostrar ícones e outros elementos visuais para aprovação antes de aplicar.
- Repositório privado.
- Os códigos de tecla atuais são usados por um remapeador que os transforma em ações do Lightroom. Não trocar sem pedir.
