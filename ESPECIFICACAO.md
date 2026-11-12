# MINI_KEYBOARD (app do fabricante) — especificação levantada por engenharia reversa

Fonte: `/Applications/MINI_KEYBOARD.app` (Qt), decompilado com Ghidra, mais testes no teclado real
(VID 0x514C, PID 0x8850, firmware 11, 12 teclas + 4 knobs). O que está marcado "confirmado" foi
visto no teclado; o resto vem só do código.

## 1. Conexão

- HID, interface de configuração com usage page 0xFF00. Também aceita VID 0x1189.
- Só pelo cabo USB. Pelo Bluetooth o teclado digita, mas não abre a interface de configuração.
- O app do fabricante abre o dispositivo em modo exclusivo: com ele aberto, nenhum outro programa
  consegue configurar (confirmado).

## 2. Protocolo (firmware >= 10)

Relatórios de 65 bytes, report ID 3.

| Pedido | Resposta / efeito |
|---|---|
| `03 FB FB FB` | `03 FB teclas knobs firmware` (confirmado: `03 FB 0C 04 0B`) |
| `03 FA 19 00 camada` | 25 respostas, uma por entrada (confirmado) |
| `03 FD idx camada tipo flag n 00 00 itens…` | grava uma entrada |
| `03 FD FE FF` | confirma a gravação na flash; o app espera 1 s depois |
| `03 FA B0 camada-1` | `03 FA modo rgb[48]` (confirmado; camada de LED começa em 0) |
| `03 FE B0 camada-1 modo rgb[48]` | grava a luz de uma camada |

Firmware < 10 usa outro formato (PHY1). O Padturn recusa esses modelos com uma mensagem clara.

### Entrada (64 bytes)

`03 FA idx camada tipo flag n 00 00` e depois os itens.

- **Numeração.** Teclas 1..K, depois 3 entradas por knob: girar à esquerda, apertar, girar à direita.
  Ordem confirmada no teclado (camada 3, knob 1 = Vol−, Mudo, Vol+).
- **Entrada vazia.** `tipo 1, n 0` (confirmado).

| tipo | conteúdo |
|---|---|
| 1 teclado | itens de 3 bytes: código HID + atraso big-endian (padrão 50 ms = `00 32`). Modificadores são pseudo-teclas: F1 Ctrl, F2 Shift, F3 Alt, F4 Win/Cmd, F5–F8 os mesmos do lado direito (strings de `Widget::Traversal_Key_Txt`). Mais de uma tecla não-modificadora = macro, até 18 itens. |
| 2 mídia | uso consumer de 16 bits little-endian nos bytes 9–10, n=2 |
| 3 mouse | n=4. flag 1: `[9]` modificador, `[12]` botões (1 esq, 2 dir, 4 meio), `[21]` roda (1 cima, FF baixo). flag 4: `[9]` gesto (1 curtir, 2–5 deslizar ← → ↑ ↓). |

### Luz

- 16 triplos RGB: 12 teclas e depois 4 anéis dos knobs.
- Modos 0–5 (o app original só os chama de "LED Mode0..5"). Confirmado no teclado do usuário: Modo 0 e 2 = sem luz (iguais), 1 = cores por tecla, 3 = irradia para 3 teclas de cada lado, 4 = arco-íris, 5 = ondas de cor. Modos 1 e 3 usam a cor de cada tecla. Outros firmwares podem ser diferentes.
- Gravação de teclas e de luz confirmada no hardware em 2026-11-12.
- No teclado do usuário: camada 1 está no modo 2 (arco-íris), camada 2 no modo 1 (ciano), camada 3 no modo 1 (vermelho escuro).

## 3. Modelos

`Identify_KeyBoard_style` escolhe uma de ~30 telas desenhadas à mão, a partir do par (teclas, knobs):

- 0add1, 0add2, 0add3
- 1add0, 2add0, 3add0, 4add0
- 3add1
- 4add1, 4add2, 4add3
- 5Key_Mute, 6Key
- 6add1, 6add2 (+ _Lan_KD)
- 9add0, 9add2, 9add3
- 11add3
- 12add0, 12add2, 12add3, 12add4 (+ _Lan)
- 15add3
- 16add0, 16add3
- 21add1

### Desenho do 12+4 (de pé)

- Teclas 1–12 em grade 4×3 à esquerda.
- Knobs à direita:
  - entradas 16–18: pequeno, em cima à esquerda
  - entradas 19–21: pequeno, em cima à direita
  - entradas 22–24: médio, no meio
  - entradas 13–15: grande, embaixo

O usuário usa o teclado girado 180°.

## 4. Telas do app original

- BaseKeys: letras, números, F1–F12.
- Ctrl Shift Alt: inclui os modificadores do lado direito e F13–F24.
- MultiMedia: 21 ações.
- RGB LED: 6 modos e uma cor por tecla.
- Mouse/Swipe: 16 ações.
- DelaySetting: atrasos da macro.
- Procreate: atalhos prontos.

## 5. Problemas de usabilidade do original e como o Padturn resolve

| Original | Padturn |
|---|---|
| Escolher tecla numa lista | Clicar e apertar a tecla real; ou teclado virtual com layout real |
| Desenho fixo de pé | Gira o desenho em passos de 90° |
| Não mostra o código enviado | Mostra nome + código em cada controle |
| Sem backup | Backup automático antes de cada gravação; exportar/restaurar |
| Sem conferência | Relê o teclado depois de gravar e compara byte a byte |
| Não mostra qual controle foi apertado | A tecla física acende no desenho (inclusive giro do knob) |

## 6. Ainda não confirmado no hardware

- Desenho e ordem dos knobs em modelos diferentes do 12+4.

## 7. Build

- macOS: `npx tauri build --bundles app`.
- Windows: o código Rust compila para `x86_64-pc-windows-msvc` (checado daqui com `cargo check`). No Windows a hidapi usa o backend Rust puro (`windows-native`), sem precisar compilar C. O instalador (.exe/NSIS) precisa ser gerado numa máquina Windows ou num CI.
- Testes: `node ui/model.test.mjs` e `node ui/layouts.test.mjs`.
