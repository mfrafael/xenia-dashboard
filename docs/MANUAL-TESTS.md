# Testes manuais (CachyOS + Xenia Edge). Histórico: as seções por versão abaixo são do tempo em que o app se chamava NXE

O que precisa de você com o controle e um jogo de verdade. Tudo o resto já foi testado
automaticamente (61 testes) e por screenshots da UI real com o seu config. Anote o que
falhar e me mande a mensagem/print.

Abrir: menu do KDE → **NXE** (ou `nxe` no terminal, que mostra os logs).
Se algo der errado no config do Xenia: o original intacto está em
`~/.local/share/Xenia/xenia-edge.config.toml.nxe-backup` (criado na primeira edição).

## 1. Biblioteca
- [ ] Os 10 jogos XBLA aparecem (Banjo-Kazooie, Banjo-Tooie, Bomberman ×2, GoldenEye, Mega Man 9/10, Perfect Dark, Radiant Silvergun, Trials HD).
- [ ] Um XBLA abre pelo NXE (A) e volta pro dashboard ao fechar.

## 2. Capas
- [ ] Admin → **Game covers** → **Download all covers automatically**: a mensagem deve dizer ~26 baixadas, 0 sem title ID.
- [ ] As capas aparecem no carrossel (incluindo XBLA e os multidisco).

## 3. Configurações do sistema
- [ ] Admin → **Xenia system settings** abre e mostra o caminho `…/xenia-edge.config.toml`.
- [ ] Mude algo visível e reversível (ex.: **Display → Anti-aliasing**) com ←/→; abra um jogo e confira que o Edge respeitou.
- [ ] Abra o próprio Xenia Edge (fora do NXE) e confira que ele não reclama do config e mostra a mesma opção.
- [ ] **Profiles → Player 1** mostra o gamertag do seu perfil.

## 4. Configurações por jogo ⚠️ o mais importante
O caminho `~/.local/share/Xenia/config/<TitleID>.config.toml` foi deduzido do binário do Edge, não confirmado na prática.
- [ ] No carrossel, **Y** num jogo → **Game settings → Graphics → Resolution scale**: mude para um valor diferente do sistema (aparece ●).
- [ ] Abra esse jogo e depois rode: `grep -i "game config" ~/.local/bin/xenia.log`
      Esperado: `Loading game config: …/config/<TitleID>.config.toml` e `Applied N game config override(s)`.
      **Se não aparecer, me mande a saída** — ajusto o caminho.
- [ ] Alternativa rápida: no próprio Xenia Edge, salve uma config por jogo (painel de config do jogo) e rode
      `find ~/.local/share/Xenia -name '*.config.toml' -newer ~/.local/share/Xenia/recent.toml` — o arquivo deve cair em `config/`.
- [ ] **X** no item volta pro valor do sistema (some o ●).

## 5. Patches
- [ ] **Y** em Gears of War → **Patches → Download patches**: deve baixar 3 arquivos.
- [ ] Ligue **60 FPS**, abra o jogo e confira (MangoHud mostra FPS).
- [ ] `ls ~/.local/share/Xenia/patches/` mostra os arquivos `4D5307D5 - …patch.toml`.
      Se o Edge não aplicar, rode `grep -i patch ~/.local/bin/xenia.log` e me mande.

## 6. Ficha do jogo
- [ ] **Y** em Ninja Gaiden II → **Game details**: dados do jogo, "1 save", e 60 conquistas (0 desbloqueadas).
- [ ] D-pad ↑/↓ rola a descrição/conquistas.

## 7. Controle de verdade (navegação)
- [ ] ←/→ mudam valores; A também; B volta um nível (não fecha tudo); Start abre o Admin normal mesmo depois de usar Y.

## 8. Opcional: AppImage
- [ ] `~/.local/opt/NXE-2.0.0.AppImage` abre (pacote único, mesmo app). Não precisa trocar o atalho; o `nxe` atual roda do código-fonte e é o que eu atualizo.

---

# Testes da 2.1.0 (coluna de seções)
- [ ] Na Game Library aparece **Xenia** apagado logo abaixo do título, e no rodapé "↑ ↓ Section".
- [ ] **↓** no controle desce para **Xenia**: o trilho de jogos sobe/desce e entram 4 tiles (System settings, Profiles, Game settings, Advanced). O nome "Game Library" fica apagado em cima e "Dashboard" embaixo.
- [ ] **↓** de novo vai para **Dashboard** (View, Sound and animations, Game covers, PIN and locks, Install Wizard, Exit to desktop); **↑** volta, e a Game Library lembra em qual jogo você estava.
- [ ] **←/→/LB/RB** movem os tiles; a descrição do tile aparece na linha do contador.
- [ ] **A** num tile abre a tela correspondente (pede PIN se você religar; hoje está desligado). **B** na primeira tela volta **direto para o dashboard** (não para o painel Admin antigo).
- [ ] Dashboard → *Locations and PIN* abre o painel antigo (ROM, Xenia, runner, PIN) e **B** volta pro dashboard.
- [ ] **Exit to desktop** fecha o NXE.
- [ ] Dentro de um jogo multi-disco (Lost Odyssey), **↑/↓ não trocam de seção** até você sair dos discos com B.
- [ ] O botão **Admin** e o **Start** continuam abrindo o painel antigo como antes (será removido na D4).

---

# Testes da 2.2.0 (pedidos do dono + D3)
- [ ] **↑ na Game Library** vai para **Dashboard** (a lista é cíclica); **↓ no Dashboard** volta para a Game Library. O trilho desce/sobe com animação.
- [ ] **X num jogo** abre direto o *Game settings* daquele jogo (título "<jogo> · Game settings"). **B** fecha e volta pra biblioteca, no mesmo jogo. No rodapé aparecem "X Game settings" e "Y Options" (só na biblioteca, não nos tiles).
- [ ] **Y** num jogo continua abrindo o menu (Game settings, Patches, Game details).
- [ ] Xenia → **Profiles** → **B** volta **direto pro dashboard** (antes caía no menu de ajustes). Xenia → **Advanced** → B (na lista de seções) também volta pro dashboard; dentro de uma seção do Advanced, B volta pra lista.
- [ ] Xenia → **System settings** → no fim da lista o botão agora diz **"Return to dashboard"**.
- [ ] Dashboard tem os tiles: View, **Sound and animations**, Game covers, **PIN and locks**, Install Wizard, Exit to desktop.
- [ ] **Locations**: pastas, executável do Xenia, runner, Browse, Save and rescan; B volta pro dashboard.
- [ ] **PIN and locks**: New PIN, PIN protection, **Lock Xenia section**, **Lock Dashboard section** (ligam/desligam na hora). Religue o PIN, deixe só o Xenia destravado, e confira: tile do Xenia abre **sem** PIN, tile do Dashboard **pede** PIN, e o botão Admin/Start sempre pede.
- [ ] Depois de entrar no Xenia sem PIN, o Dashboard continua pedindo PIN (uma sessão não vale pra outra).
- [ ] (Só se religar o PIN) A tela de PIN aparece ao abrir um tile travado; B cancela e volta pro dashboard.

---

# Testes da 3.0.0 (D4 + pedidos)
- [ ] Não existe mais o botão **Admin** no canto, e o **Start** não faz nada.
- [ ] **SELECT** abre uma janela no **meio da tela** ("Exit NXE?") com **Cancel** (selecionado) e **Exit to desktop**. ←/→ ou ↑/↓ trocam, **A** confirma, **B** cancela. O botão **Guide** (logo do Xbox) faz o mesmo se o KDE não o interceptar; me diga se ele não funcionar.
- [ ] Confirmando **Exit to desktop** o NXE fecha. (Se você religar o PIN e o Dashboard estiver travado, pede o PIN antes de fechar.)
- [ ] No teclado, **Esc** na biblioteca abre a mesma janela; **Alt+F4** continua bloqueado.
- [ ] O tile **Exit to desktop** do Dashboard abre a mesma janela.
- [ ] **Locations** agora fica no **Xenia** (último tile) e não no Dashboard; pastas, Browse, Save and rescan e B voltando ao dashboard.
- [ ] **Dashboard › PIN and locks › New PIN**: digite um PIN novo (4–8 dígitos), confirme com Done/Enter: aparece "PIN changed." e já vale (religue a proteção para testar). **Antes isso não gravava em lugar nenhum** (era um defeito da 2.2).
- [ ] Com a biblioteca vazia a legenda diz "Choose your ROM folder in Xenia › Locations".

---

# Testes da 3.0.1 (Alt+F4)
- [ ] Com o PIN **desligado** (como está), **Alt+F4** fecha o NXE na hora.
- [ ] Religue o PIN em Dashboard › PIN and locks: **Alt+F4** agora abre a janela "Exit NXE?" (e se você estiver numa tela de ajustes, ela fecha a tela antes). Confirmar pede o PIN.
- [ ] Com um **jogo rodando**, Alt+F4 vale para o Xenia (é o gerenciador de janelas que decide), e o NXE em segundo plano não fecha.
- [ ] Fazer logout/desligar o PC com o NXE aberto não trava mais esperando o NXE.

---

# Testes da 1.0.0 (renomeado para Xenia Dashboard)
- [ ] Abrir pelo menu do KDE: o atalho agora se chama **Xenia Dashboard** (o comando `xenia-dashboard` no terminal; o `nxe` antigo continua funcionando como atalho).
- [ ] A janela e o topo-esquerda mostram **Xenia Dashboard** (a skin continua sendo a NXE).
- [ ] **Seus dados continuam intactos** (capas, PIN, configurações): ficam em `~/.config/NXE`, que o app encontra e reaproveita sozinho.
- [ ] SELECT abre "Exit Xenia Dashboard?".

---

# Testes da 1.0.1 (seletor de seções)
- [ ] Na Game Library, o texto apagado **em cima** é a seção para onde o **↑** vai (**Dashboard**) e o de **baixo** é para onde o **↓** vai (**Xenia**). Em Xenia: em cima Game Library, embaixo Dashboard. Em Dashboard: em cima Xenia, embaixo Game Library.
- [ ] Não existe mais "Your collection" nem o nome do app fazendo papel de seção. O título da seção ativa fica sempre na mesma altura.

---

# Testes da 1.1.0 (A abre um menu de opções)
- [ ] Xenia › System settings › Console › **Language**: **A** abre uma janela no meio com todos os idiomas, o atual marcado com ✓ e já selecionado. ↑/↓ andam, **A** escolhe, **B** cancela sem mudar nada.
- [ ] **←/→** num item continuam girando os valores rápido, sem abrir o menu.
- [ ] Itens de On/Off (ex.: Fullscreen) também abrem o menu com On e Off.
- [ ] Números com faixa (Master volume, deadzones, limite de FPS, volume de música) abrem uma lista de passos (0, 5, 10… ou 0%, 5%…).
- [ ] Texto livre (pasta de conteúdo) continua abrindo o teclado.
- [ ] **LB + RB** juntos mostram uma notificação de teste (pílula cinza no canto superior direito, entra e sai deslizando pela direita, "XENIA UPDATE AVAILABLE", som de notificação); só aparece depois do vídeo de boot. Ao abrir o app com um Xenia desatualizado, a mesma notificação aparece sozinha.
- [ ] Dashboard › Sound and animations › **Notification time**: ← / → na linha mudam de 0,5 em 0,5 s (0 a 5, o valor aparece como ‹ 2.5 s ›); **A** abre a lista (Off, 0.5 s … 5 s). Com **Off** nem a notificação nem o som aparecem (teste com LB + RB). O tempo escolhido é o que a notificação fica na tela.
- [ ] Dashboard › Sound and animations: **Sound volume**, **Music**, **Sound effects**, **Animations** e **Boot animation** abrem menus (Music e Sound effects são ON/OFF separados); Dashboard › Themes: **View** (NXE 2008-2010 / Blades 2005-2008) e **Wallpaper**; ao trocar o View com uma boot animation fixa de outro tema, ele pergunta se quer usar a do novo tema; Dashboard › PIN and locks: **PIN protection** e **Lock … section** também.
- [ ] O menu aparece **por cima** da tela de ajustes (não atrás).

---

# Testes da 1.1.1 (menus sem duplicação)
- [ ] Xenia › **System settings** lista só: Console, Display, Graphics, Audio, Controllers, System, Storage (e Return). **Sem Profiles e sem Advanced** dentro dela.
- [ ] **Profiles** e **Advanced** continuam como tiles da seção Xenia, abrindo direto, com os títulos "Profiles" e "Advanced", e B volta pro dashboard.
- [ ] Nas **Game settings** de um jogo (X ou Y) o **Advanced** continua existindo.

---

# Testes da 1.1.2 (nomes)
- [ ] As seções se chamam **Xenia Settings** e **Dashboard Settings** (coluna do alto e título grande); a Game Library continua igual.
- [ ] Os tiles de Xenia Settings são: **System**, **Profiles**, **Games**, **Advanced**, **Locations**. As telas por dentro continuam com os títulos "System settings", "Game settings" etc.
- [ ] Em Dashboard Settings › PIN and locks as travas se chamam **Lock Xenia Settings** e **Lock Dashboard Settings**.

---

# Testes da 1.1.3
- [ ] Xenia Settings › **System** lista: Console, Display, Graphics, Audio, Controllers, **Emulation**, Storage. Não existe mais "System" dentro de "System".
- [ ] **Emulation** tem: Game patches, Title updates, Allow mismatched title updates, Achievement pop-ups, Discord status, Plugins and trainers (e GameMode/MangoHud no Linux).

---

# Testes da 1.2.0 (menu do SELECT)
- [ ] **SELECT** abre uma janela no meio da tela chamada **Xenia Dashboard** com: Game Library, Xenia Settings, Dashboard Settings, Profiles, Exit to desktop. A seção em que você está vem marcada com ✓ e já selecionada (um A sem querer não muda nada). Não existe botão Resume: o **B** fecha o menu.
- [ ] Escolher uma seção **salta** para ela (com a animação de sempre). Escolher **Profiles** abre direto a tela de perfis (e o B volta pro dashboard, na seção Xenia Settings).
- [ ] **Exit to desktop** pergunta de novo ("Exit Xenia Dashboard?", com **Cancel** selecionado). Só fecha se você confirmar.
- [ ] **B** fecha o menu sem fazer nada. O botão **Guide** (logo do Xbox) e **Esc** abrem o mesmo menu.
- [ ] Dentro de uma tela de ajustes o SELECT também abre o menu (fecha a tela antes). **Não** abre enquanto você digita (teclado na tela / PIN) nem com jogo rodando.
- [ ] Rodapé mostra **SELECT Menu**.

---

# Testes da 1.3.0 (ícones)
- [ ] Cada tile tem o seu ícone: System = console, Profiles = pasta com pessoa, Games = controle, Advanced = pasta "more", Locations = pasta, Themes and sound = tema, Game covers = câmera, PIN and locks = pessoa com cadeado, Exit to desktop = monitor.
- [ ] Os ícones estão nítidos (o do cadeado é o único de 32 px, então pode parecer um pouco mais suave).

---

# Testes da 1.3.1 (ordem dos tiles)
- [ ] Xenia Settings mostra os tiles nesta ordem: **System, Folders, Updates, Profiles, Games, Advanced**. Advanced é sempre o último de qualquer seção.

---

# Testes da 1.4.0 (instalar e atualizar o Xenia Edge)
**Linux (CachyOS)**
- [ ] Xenia Settings tem um tile novo **Updates** (antes do Advanced). Ao abrir, ele mostra "Not installed", a versão mais nova do Edge (hash, data, tamanho) e as mudanças.
- [ ] **Install <versão>** baixa (aparece "Downloading… N%"), confere o SHA-256 e instala. Como você **já tem** um Xenia configurado, aparece "Use the new version?" com **Keep my current Xenia** selecionado. Escolha *Keep* e confira em Xenia Settings › Locations que o executável **não mudou**.
- [ ] **Use it in Xenia Dashboard** troca para a cópia instalada (em `~/.config/NXE/xenia/edge/xenia_edge_linux.AppImage`). Abra um jogo para confirmar que roda. Depois volte ao seu em Locations se preferir.
- [ ] Se existir uma versão mais nova, **Update to <versão>** instala e guarda a anterior; **Go back to <versão>** volta.
- [ ] Sem internet, a tela mostra "Could not check: …" e nada quebra.
**Windows (não testável por mim)**
- [ ] Instalar baixa o zip, descompacta em uma pasta própria com `portable.txt` e deixa `xenia_edge.exe` pronto. Atualizar **mantém** o `xenia-edge.config.toml` e a pasta `content` que o Xenia criou.
- [ ] Com o Xenia aberto, atualizar mostra "Close Xenia first" em vez de corromper.
**Primeira abertura (máquina sem Xenia)**
- [ ] Sem nenhum Xenia configurado, a biblioteca vazia diz "No Xenia yet: install it in Xenia Settings › Updates"; instalar já deixa o Xenia pronto para uso.

---

# Testes da 1.4.1 (correção do instalador)
- [ ] Em Updates, o seu Edge atual aparece como **"Your current Xenia: /home/user/.local/bin/xenia_edge_linux.AppImage (version not recognised…)"** e o estado fica **"Not installed by Xenia Dashboard"** (o que o app mesmo instalou). Não diz mais que "não está instalado".
- [ ] **Install <versão>** agora **baixa** (mostra "Downloading… N%") e termina com "Installed.", sem o erro "Redirect was cancelled". Em seguida aparece "Use the new version?" com **Keep my current Xenia** selecionado.
- [ ] Depois de instalar, a linha vira **"Up to date ✓"** e aparece **"Use it in Xenia Dashboard"**.
- [ ] A cópia fica em `~/.config/NXE/xenia/edge/xenia_edge_linux.AppImage` (cerca de 19 MB).

---

# Testes da 1.5.0 (Canary e Xenia oficial)
- [ ] Em Xenia Settings › Updates a primeira linha agora é **Channel: Xenia Edge**. **A** abre um menu com **Xenia Edge**, **Xenia Canary** e **Xenia (official)** (este marcado "not available on this system" no Linux).
- [ ] Escolhendo **Xenia Canary**: mostra a última build (hash, data, tamanho). **Install** baixa o AppImage (~17 MB) para `~/.config/NXE/xenia/canary/`. **Use it in Xenia Dashboard** troca para ele; **os dois canais ficam instalados ao mesmo tempo**, cada um com a sua pasta.
- [ ] Ao usar o Canary, o app procura as configurações em `~/.local/share/Xenia/xenia-canary.config.toml` (separado do `xenia-edge.config.toml`). Abra um jogo uma vez para o Canary criar esse arquivo e confira as telas de System settings.
- [ ] O Edge que você já usa continua intacto e escolhível a qualquer momento (Locations, ou "Use it" no canal Edge).
**Windows (não testável por mim)**
- [ ] Canary: o `.7z` é descompactado com o 7-Zip embutido e deixa `xenia_canary.exe` ao lado de `portable.txt`.
- [ ] Oficial: `xenia.exe` (sem o arquivo de símbolos de 56 MB).
- [ ] Os três canais podem coexistir em pastas separadas.

---

# Testes da 1.6.0 (configurações otimizadas por jogo)
- [ ] Y num jogo: o menu agora tem **Game settings, Optimized settings, Patches, Game details**.
- [ ] Em **Gears of War 3**, **Fable II**, **Ninja Gaiden II**, **Lost Odyssey** (tem ajuste da comunidade): **Optimized settings** mostra "N changes for this game · updated <data>" e cada mudança (`GPU › chave: antes → depois`) com o motivo.
- [ ] **Apply N settings** grava só nesse jogo (abra Game settings do jogo: as chaves aparecem com ●) e a tela passa a dizer "Nothing to change". X em um item volta ao valor do sistema.
- [ ] Abra o jogo e confira com `grep -i "game config" ~/.local/bin/xenia.log` que o Edge carregou o override.
- [ ] Em **Fable III**, **Dante's Inferno**, **Banjo-Kazooie** (sem ajuste da comunidade): a tela diz "None for this game yet".
- [ ] Chaves que o seu Edge não tem (ex.: `vsync`) aparecem em "Skipped" e não são aplicadas.

---

# Testes da 1.7.0 (DLC e title updates)
Eu não tenho DLC nem title update reais para testar; confirmar que o Xenia **carrega** o conteúdo copiado é com você.
- [ ] Y num jogo: o menu agora tem **Game settings, DLC and updates, Patches, Game details** (Optimized settings agora é a primeira linha de dentro de Game settings, separada das categorias por uma linha).
- [ ] Coloque um pacote de DLC ou TU (arquivo STFS sem extensão, como baixado) **dentro da pasta de ROMs** (pode ser numa subpasta). Ele **não** deve aparecer na lista de jogos.
- [ ] **DLC and updates** do jogo certo lista "Install: <nome>" com tipo (DLC / Title update) e tamanho. Pacotes de **outros jogos** não aparecem.
- [ ] **Install** mostra "Copying… N%" e termina com "Installed …". O arquivo fica em `~/.local/share/Xenia/content/0000000000000000/<TITLEID>/00000002/` (DLC) ou `.../000B0000/` (TU), igual ao original.
- [ ] O item continua na lista, agora como "✓ Installed: …" (A nele só avisa "Already installed"), e aparece também em "Already in Xenia".
- [ ] Abra o jogo no Xenia: o DLC/TU aparece no menu do jogo (ou o TU é aplicado). Se não carregar, anote o título e o tipo.
- [ ] Salvamentos, temas e outros pacotes na pasta de ROMs não são oferecidos.
- [ ] Com o jogo rodando, Install é recusado ("Close the running game…").
**Windows (não testável por mim)**
- [ ] Mesmo teste; o destino fica em `content\0000000000000000\<TITLEID>\...` ao lado do `portable.txt`.

# Testes da 1.7.3 (Optimized settings dentro de Game settings)
- [ ] Em Game settings (Y no jogo, ou X na biblioteca) a primeira linha é **Optimized settings**, com uma linha separando das categorias (Console, Display…). Navegar com ↑/↓ passa pela linha sem "parar" nela.
- [ ] **Optimized settings** não aparece mais no menu do jogo (só dentro de Game settings).
- [ ] B ou "Return" em Optimized settings volta para Game settings, com a primeira linha selecionada; depois de aplicar, as chaves mudadas aparecem com ●.

# Testes da 1.8.0 (Change cover por jogo)
- [ ] Y num jogo: o menu agora tem **Game settings, DLC and updates, Change cover, Patches, Game details**.
- [ ] **Change cover › Choose an image from this computer** abre o seletor de arquivos (JPEG, PNG ou WebP). Escolher uma imagem troca **só a capa desse jogo** (confira na biblioteca); os outros jogos não mudam. Cancelar o seletor não muda nada.
- [ ] Escolher um arquivo que não é imagem (ex.: um `.txt` renomeado para `.png`) mostra "Choose a JPEG, PNG or WebP image".
- [ ] **Search LaunchBox for: [game name]** aparece nos resultados de LaunchBox; editar o texto pesquisa por outro título (inclusive após não encontrar resultados). Escolher um jogo baixa a capa só desse jogo; B cancela a edição ou volta uma tela.
- [ ] Reiniciar o app mantém a capa escolhida.
- [ ] Conhecido: se o jogo tem uma imagem ao lado da ROM (capa "sidecar"), um novo escaneamento completo pode voltar para ela.
**Windows (não testável por mim)**
- [ ] O seletor abre e aceita as três extensões.

# Testes da 1.8.1 (capa com fundo transparente)
- [ ] Escolha em Change cover um **PNG com fundo transparente** (capa 3D). Na biblioteca o fundo aparece **transparente** (sem retângulo preto) e a capa fica inteira.
- [ ] Trocar depois por um JPEG e voltar a um PNG continua funcionando (o app guarda só uma versão por jogo).
- [ ] Capas que você já tinha trocado na 1.8.0 continuam como estavam (com fundo preto); escolha o PNG de novo para corrigir.

# Testes da 1.9.0 (LaunchBox como fonte de capas + ícone)
- [ ] Y num jogo › **Change cover** tem agora: Choose an image from this computer, Xenia Manager covers (online), **LaunchBox covers (online)**, Return.
- [ ] Primeira vez em **LaunchBox covers**: avisa do download único (~105 MB) e de que só a parte do Xbox 360 fica guardada. **Download LaunchBox data** mostra "Downloading… N%", depois "Reading the data…" (~10 s) e lista os jogos parecidos com o nome do seu jogo.
- [ ] Escolher o jogo mostra as imagens (Front, 3D box, Fan art…, por região). Ao mover entre elas aparece a **prévia** à direita. **A** usa a imagem só para esse jogo (a biblioteca mostra a nova capa; PNG com fundo transparente continua transparente).
- [ ] Reabrir LaunchBox covers depois não baixa de novo; **Update LaunchBox data** refaz o download.
- [ ] Sem internet: a mensagem de erro aparece e nada fica pela metade (`~/.config/Xenia Dashboard/launchbox/` só tem `xbox360.json`).
- [ ] **Ícone:** a janela, o atalho do menu do KDE e a barra de tarefas mostram o novo ícone (chip com o X verde). No Windows, o instalador e o atalho também.

# Testes da 1.10.0 (fonte do download automático de capas)
- [ ] Dashboard Settings › Game covers: a 2ª linha é **Source for the automatic download: …**. **A** abre um menu com *LaunchBox*, *LaunchBox, then Xenia Manager* e *Xenia Manager database* (marcado o atual; o LaunchBox sempre vem antes do Xenia Manager). A escolha fica gravada depois de usar o download.
- [ ] Com **LaunchBox** e sem os dados baixados: aparece "Download the LaunchBox data first…". Depois de baixar (Y num jogo › Change cover › LaunchBox covers), **Download all covers automatically** mostra "Downloading covers… N of M" e preenche os jogos sem capa cujo **nome inteiro** bate com o do LaunchBox.
- [ ] Jogos que não bateram aparecem em "N not found". Com **LaunchBox, then Xenia Manager** esses jogos são tentados no banco do Xenia Manager pelo title ID.
- [ ] Capas que você já tinha (baixadas ou escolhidas) **não** são trocadas por esse botão.
- [ ] Conferir se alguma capa automática do LaunchBox veio errada (jogo de nome parecido); se vier, troque em Y › Change cover.

# Testes da 1.11.0 (gerenciador de capas refeito)
Agora existe **um** gerenciador de capas, com o mesmo fluxo para todas as fontes (arquivo do computador, Xenia Manager, LaunchBox).
- [ ] **Y num jogo › Change cover**: lista "Choose an image from this computer", "Xenia Manager covers (online)", "LaunchBox covers (online)". A coluna da direita diz o estado de cada fonte (LaunchBox: "Not downloaded yet" ou "Ready · N games · data from …").
- [ ] **Xenia Manager covers**: procura pelo nome do jogo, mostra os jogos parecidos, depois a imagem (**Box art**) com **prévia** à direita; **A** troca só a capa desse jogo. (Antes não tinha prévia.)
- [ ] **LaunchBox covers**: igual (Front, 3D box, Fan art…), com download único dos dados na primeira vez.
- [ ] Trocar a capa de um jogo que **já tem capa** (baixada ou do computador) funciona; trocar de novo também.
- [ ] **Dashboard Settings › Game covers** tem, nesta ordem: **Source: …**, **Update … data** (uma por fonte que baixa dados), **Download covers** (todas), **Download missing covers**, **Rescan local cover images** e Return. Sumiram *Search covers one by one* e *Replace a downloaded cover* — isso agora é o Change cover de cada jogo.
- [ ] **Source:** abre o menu (LaunchBox / LaunchBox, then Xenia Manager / Xenia Manager). **Download missing covers** mostra "Downloading covers… N of M" e termina com "N covers downloaded · M not found". Capas que já existem não mudam.
- [ ] Com LaunchBox escolhido, a linha **Update LaunchBox data** fica logo abaixo de **Source**, baixada ou não; se os dados ainda não foram baixados, baixar capas avisa para atualizá-los antes.
- [ ] **Install Wizard › Download covers** faz tudo dentro do wizard: baixa os dados da fonte (se faltam), depois as capas dos jogos sem capa, mostrando o progresso no próprio cartão, e termina com **Continue**. Sem rede: mostra o erro com **Try again** e **Skip this step**.

# Testes da 1.0.0 (Install Wizard e View)

Para uma primeira execução de verdade, mova `~/.config/NXE/library.json` (ou a pasta de dados do app) para outro lugar antes de abrir; depois devolva.

- [ ] Instalação nova: depois da animação de abertura aparece uma tela **neutra** (cinza-escuro, sem verde) "Choose how your dashboard looks", com a linha do tempo 2005 · 2008 · 2010 · 2011 e o foco no **Blades** (o mais antigo).
- [ ] ←/→ andam pela linha (param nas pontas), o preview, o nome com os anos e a frase mudam; não toca nenhum som nessa tela.
- [ ] A numa view aplica na hora e o passo seguinte ("Set up Xenia", com "Setup · step 2 of 3 — …") já aparece **nessa view**, sem pedir PIN.
- [ ] **Install or choose Xenia** abre o Updates; ao sair (B) o wizard vai para "Choose your game folders"; **Choose game folders** abre Folders; ao sair com jogos achados aparece "Download covers · step 4 of 4"; sem jogos o passo de capas não aparece ("of 3").
- [ ] **Skip this step** pula só aquele passo; **Skip setup** encerra e mostra a biblioteca; B num passo volta ao anterior; B no primeiro passo pergunta "Skip setup?".
- [ ] Ao terminar, abrir o app de novo não mostra o wizard; as seções de Xenia e Dashboard voltam a pedir o PIN.
- [ ] Fechar o app no meio do wizard, depois de escolher a view: ao reabrir o wizard **não** volta sozinho (a view já foi salva); *Dashboard Settings › Install Wizard* o refaz.
- [ ] Instalação que já estava configurada (com Xenia e pastas): nunca abre o wizard sozinho.
- [ ] *Dashboard Settings › Install Wizard* (pede o PIN) refaz o fluxo começando pela view atual marcada com ✓; com Xenia já instalado o passo mostra "Change Xenia".
- [ ] *Dashboard Settings › View* mostra a mesma linha do tempo no painel da view em uso; A aplica, B volta; se a animação de abertura estava fixa em outra view, pergunta se deve seguir a nova.

# Testes da 1.1.0 (modo janela, teclado, capas e primeira execução)

Para ver como um usuário novo, sem tocar nos seus dados: abra o app com uma pasta pessoal vazia (por exemplo `HOME=/tmp/novo-usuario ./xenia-dashboard`).

- [ ] *Dashboard Settings › View* tem a linha **Window: Fullscreen**; A abre o menu e **Windowed** troca na hora, sem fechar o app, sem intro e na mesma tela. A janela tem barra de título, abre em 1280×720 e não encolhe abaixo de 960×540.
- [ ] **Alt + Enter** alterna entre tela cheia e janela em qualquer tela, sem PIN; durante um jogo não faz nada. A linha *Window* do menu *View* acompanha.
- [ ] A janela volta ao tamanho e à posição em que estava ao voltar de tela cheia e ao reabrir o app.
- [ ] Esticar a janela em qualquer proporção: tudo acompanha; os botões A/B/X/Y ficam redondos em todas as views; na Blades os nomes das blades à direita ficam centrados nas faixas, em tela cheia e em janela estreita.
- [ ] Teclado: **W A S D** movem como as setas, **Q / E** trocam de seção (LT / RT), **Enter** é A e **Esc** é B. Digitando um PIN, um texto ou uma busca, essas letras só escrevem.
- [ ] Ao editar uma busca com controle, manter **X** pressionado apaga caracteres repetidamente depois de uma breve pausa; soltar para parar.
- [ ] **Game covers** na ordem: Source, Update … data, Download covers, Download missing covers, Rescan, Return. No Install Wizard, **Download covers** faz tudo no próprio cartão (dados da fonte, depois as capas), mostra o progresso e termina em **Continue**; sem rede mostra o erro com **Try again** e **Skip this step**.
- [ ] Sem Xenia configurado (passo pulado no wizard): *Xenia Settings › System / Profiles / Advanced* abre a janela **Xenia is not set up** com **Set up Xenia** (vai para o Updates) e **Not now**. Nenhuma tela de PIN aparece numa instalação sem PIN.
- [ ] Logo depois de instalar um Xenia que ainda não rodou, abre a janela **Start Xenia once**; abrir Profiles/Advanced antes de rodar o Xenia mostra a mesma janela. Depois de rodar o Xenia uma vez, nada disso aparece.
- [ ] *Xenia Settings › Updates*: checa sozinho ao abrir e ao trocar de channel; não há botão *Check for updates*. A linha abaixo de *Channel* diz **Checking for updates…**, **Up to date ✓** (A checa de novo), **Update to …**, **Install …** (primeira instalação) ou **Could not check · try again**.
- [ ] A linha do tempo do seletor de View (wizard e *View*) tem os círculos alinhados na linha, o do foco maior e centralizado, e os nomes na mesma altura.
