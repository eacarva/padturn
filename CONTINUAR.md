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
  - O CI é o GitHub Actions (`.github/workflows/build.yml`), grátis porque o repositório vai ser público.
- **Regra:** o app MINI_KEYBOARD prende o teclado. Feche-o antes de usar o Padturn.

## Estado (2026-11-12)

### Funciona e foi conferido

- Leitura e gravação das 3 camadas (teclas e luz), dos knobs e das cores.
- Desenho girável. O usuário usa o teclado de cabeça para baixo (180°).
- Posição dos knobs conferida com os knobs físicos.
- Captura de tecla real (inclusive numpad e modificadores direitos F5–F8) e teclado virtual com layout real.
- Mídia, mouse/gestos e macro com atrasos.
- Destaque ao vivo da tecla ou knob apertado.
- Backup: exportar, restaurar e backup automático antes de gravar.

### Pendente, em ordem

1. **Gravação no hardware — testada e funcionando (2026-11-12).**
   - Teste: camada 3, tecla 1 → F13 → Gravar → "Gravado e conferido" → volta para Nada → Gravar → "Gravado e conferido".
   - Os backups automáticos ficam em `~/Library/Application Support/app.padturn/backups/`.
   - O primeiro backup é idêntico ao original. O segundo difere só por F13, o que prova que a gravação chegou ao teclado.
   - Commit `03 FD FE FF` confirmado.
2. **Luz — feita e gravação testada (2026-11-12).**
   - Botão "Luz" na barra: modo da camada e "Apagar a cor de todas as teclas".
   - O app original só chama os modos de "LED Mode0..5". Pelo teclado do usuário: Modo 0 e 2 = sem luz (o 0 fica escondido, LED_ALIAS), 1 = cores por tecla, 3 = irradia luz para 3 teclas de cada lado, 4 = arco-íris, 5 = ondas de cor (testado pelo usuário). Cores por tecla valem nos modos 1 e 3 (PER_KEY_MODES). Falta: animação de cada modo no desenho (usuário vai mandar vídeo).
   - O desenho só mostra cor por tecla no Modo 1.
   - Teste: camada 3 → Modo 2 → Gravar → "Gravado e conferido" → Modo 1 → Gravar → "Gravado e conferido".
   - Falta descobrir o que fazem os modos 0, 3, 4 e 5. Quem tiver o teclado na mão deve testar e dar nome em `LED_MODE_NAMES` (`ui/app.js`), por modelo e firmware.
3. *(item fundido no 2.)*
4. **Outros modelos.** O desenho e a ordem dos knobs fora do 12+4 são um palpite. O destaque ao vivo confirma quando alguém tiver um desses modelos.
5. **CI e instaladores.** Workflow escrito; falta publicar o repositório e rodar (tag `v*` ou à mão). Builds sem assinatura.

## Últimas mudanças

### Usabilidade (2026-11-13, feito sem o usuário; conferido na tela com o teclado conectado)

- **Teclado encontrado sozinho.** O app procura o teclado a cada 1,5 s (comando `present`, que não abre o aparelho). Ao conectar, lê sozinho. Se a leitura falhar (ex.: MINI_KEYBOARD aberto), tenta de novo a cada 4 s sem piscar a tela. Ao desconectar, avisa e desativa Gravar. Se voltar com alterações pendentes, elas ficam.
  - Bolinha verde na barra de status = conectado.
- **Desfazer/Refazer** (⌘Z / ⇧⌘Z) de qualquer alteração pendente. Num campo de texto, ⌘Z desfaz o texto.
- **Barra de menus do macOS** em português: Arquivo (Ler ⌘R, Gravar ⌘S, Exportar ⇧⌘E, Restaurar ⇧⌘O), Editar, Visualizar (Camada ⌘1–3, Girar ⌥⌘R).
  - No Windows os mesmos atalhos com Ctrl, tratados pela página.
  - Durante a captura de tecla os atalhos do menu ficam desligados, para dar para gravar ⌘Z, ⌘S etc. como tecla (testado).
- **Esc** para a captura ou desmarca.
- **Não perde alterações:** "Ler" e fechar a janela/⌘Q pedem confirmação se houver alterações não gravadas.
- **Aviso no centro** (estilo HUD do macOS) ao gravar, salvar backup e conectar.
- **Espaçamento:** escala de 4 px (`--s1`…`--s6` em `style.css`). Seções do painel a 24 px, título→conteúdo 8 px, grupos 12 px. Tirado o rótulo acima do título do painel (o nome da camada já está na barra). Ícones desenhados em SVG no lugar de glifos/emoji. Amostra "sem luz" riscada.
- **Trava de dialeto:** só grava em teclado `0x514C`. Os `0x1189` falam ch57x-1; o Padturn recusa gravar com mensagem clara.
- `.github/workflows/build.yml`: testes a cada push; `.dmg` universal e `.exe` (NSIS) numa tag `v*` ou à mão, em release rascunho. **Ainda não rodado.**
- `LICENSE.md`: PolyForm Shield 1.0.0 (pode usar e mudar, não pode competir vendendo).

Não conferido: modo escuro (precisaria mudar o sistema), desconectar o cabo de verdade, o pipeline do Windows.


- Knobs: a tampa gira para o lado em que o knob foi girado (30° por clique, acumulando). Apertar afunda o knob. Pedido do usuário; ainda não conferido com o knob físico.
- Escolher "Tecla" sem tecla vira um rascunho: aparece no painel, mas não conta para Gravar.

- Cor por tecla: paleta do próprio fabricante (52 cores, `ui/led.js`), gravada sem conversão, como o app original faz (`QColor::red/green/blue` direto nos bytes, em `FUN_100097870`).
  - O seletor do Mac grava cores convertidas (o "vermelho" dele é `ff2600`, que sai laranja). Por isso ficou só como "Outra cor…".
  - Os backups automáticos guardam o valor exato de cada teste de cor do usuário.

## Ações da camada (feito em 2026-11-12; falta conferir na tela)

### Onde ficam

No painel da direita, quando nada está selecionado. Ali já fica a "Iluminação da camada", então tudo que vale para a camada inteira fica junto, com o título "Camada N". A barra de cima continua só com coisas globais: camada, girar, iluminação, ler, backup e gravar.

### Botões

- **🗑 Limpar camada**
  - Coloca todas as entradas da camada em "Nada": teclas e as 3 partes de cada knob.
- **🎲 Sortear teclas**
  - Dá a cada entrada da camada uma tecla diferente, ao acaso e sem repetição.
  - A ordem das teclas usadas no sorteio:
    1. Letras a–z e números 0–9 (36 teclas), pedido do usuário.
    2. Se acabarem (3 camadas × 24 = 72), as mesmas com ⌃, ⌥, ⇧ e combinações desses.
  - Pula combinações já usadas nas outras camadas, para não haver conflito no remapeador.
  - Para 12 teclas + 4 knobs são 24 entradas.

### Comportamento dos dois

- Pedem confirmação antes de agir.
- Só criam alterações pendentes, como qualquer edição. Nada vai para o teclado até clicar em Gravar.
- "Descartar alterações" desfaz.

## Nomes (teclas e camadas)

- O teclado não guarda nomes. Os nomes das teclas (`1-5`) e das camadas (`layer-1`) ficam no `localStorage` do Padturn, neste computador.
- Eles sobrevivem a fechar e abrir o app.
- "Exportar backup" inclui os nomes (`labels`), e "Restaurar backup" traz de volta. É assim que se leva os nomes para outro computador.
- Restaurar também regrava o teclado, depois de confirmar.

## Regras do usuário

- Nunca gravar no teclado sem backup funcionando e sem autorização.
- Mostrar ícones e outros elementos visuais para aprovação antes de aplicar.
- Repositório privado.
- Os códigos de tecla atuais são usados por um remapeador que os transforma em ações do Lightroom. Não trocar sem pedir.

### Janela e Impeccable v4.9.0 (2026-11-13, tarde)
- A janela abre com 820 px de altura (antes 720), e o painel de tecla e o de knob cabem sem rolagem.
- Se o painel crescer (macro com muitos passos), a janela cresce sozinha até a altura da tela (`fitWindow` em app.js). Se o usuário redimensionar a janela à mão, ela para de crescer. O mínimo continua 900×560 para monitores pequenos.
  - Não testado: o crescimento automático com um macro longo e um monitor pequeno.
- O detector do Impeccable v4.9.0 rodou sobre ui/.
  - Aplicado:
    - easing sem overshoot (`--spring` virou ease-out exponencial);
    - `--muted` no modo escuro passou para #a1a1a6, com contraste 4.5:1.
  - Mantido de propósito:
    - texto branco sobre #0a84ff (azul padrão do macOS);
    - brilho colorido dos LEDs no desenho (simula a luz real);
    - amostra "sem luz" riscada;
    - preenchimento de 2 px do controle segmentado (padrão do macOS).
