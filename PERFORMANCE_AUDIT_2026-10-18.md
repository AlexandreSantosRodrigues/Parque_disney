# Auditoria de desempenho móvel — ParkPath Disney e Hogwarts

Data: 18/10/2026. Base: commit `05ecda16ca5cfd8eeeb94c9245e291cab71dc52e`.

## Método

Inspeção dos módulos de GPS, mapa, filas e CSS dos dois sites. Identificação de operações duplicadas e testes JavaScript funcionais com fontes simuladas. **Não foi realizada medição de FPS em um telefone físico**, nem teste de velocidade da rede/API no navegador hospedado; portanto, as causas são tecnicamente sustentadas pela leitura do código, mas a contribuição percentual de cada uma não foi medida.

## Causas e correções

| Problema identificado | Antes | Correção aplicada |
|---|---|---|
| Redesenho do painel fechado | `render()` reconstruía todas as linhas do painel a cada minuto, além de consultas | Apenas reconstrói o DOM da lista se estiver aberta. Ao abrir, reconstrução imediata; fechada mantém atualização leve do marcador/ficha |
| Junção repetida dos catálogos | `compiled()` associava novamente atrações e dados live por ID sempre que chamado | Cache de resultado associado à identidade das matrizes `catalog` e `live`; invalida automaticamente com dados novos |
| Marcadores fora da tela | Renderização de pontos com coordenadas mesmo fora da área visualizada | Renderiza marcadores apenas dentro do viewport do Leaflet com margem de 18%. A lista do painel continua completa. Evento `moveend` reposiciona os pinos conforme o usuário navega |
| Animações do mapa | `flyTo` e `panTo` animados durante navegação/GPS | Em telas de até 900 px e modo reduzir movimento, usa `setView` sem animação, desativa zoom/fade/inércia e reduz cache de tiles |
| GPS de alta precisão permanente | `watchPosition` em alta precisão ao carregar, além de movimentos do mapa por variações de 5 m | GPS inicial de baixa precisão, alta precisão ao escolher “Seguir” ou “Meu GPS”; interface limitada a no máximo 1 atualização por 2,5 s; câmera só acompanha deslocamentos de pelo menos 25 m com precisão de até 100 m |
| Abertura no GPS em vez do parque | GPS inicial fazia a câmera sair do parque selecionado, possivelmente gerando tiles de outro país | Abre centralizado no parque. Botões de GPS continuam permitindo ir à posição atual |
| Blur no celular | Painéis flutuantes usavam `backdrop-filter` sobre o mapa em movimento | Desativa blur em tela móvel, sem mudar tamanhos, funcionalidades ou tipografia |
| Telas pequenas | Renderização custosa de itens fora da parte visível de lista | `content-visibility:auto` em linhas do painel, com fallback progressivo onde não suportado |

## Restrições mantidas

- Disney com 4 parques; Hogwarts separado com 3 áreas.
- Controles de navegação continuam com **144 × 144 px**.
- Fonte ThemeParks.wiki, créditos, comportamento de dados ausentes e cores de filas: verde até 20, amarelo 25–50, vermelho 60+ min; 21–24 e 51–59 neutros.
- Fila não é previsão futura; leitura com mais de 12 minutos não recebe tempo colorido ativo.
- GPS e rotas a pé continuam sujeitos à precisão geográfica e cobertura do provedor externo.
- Os pinos fora da área visível não são excluídos do cadastro: voltam ao mapa ao mover/zoom.

## Testes de regressão executados

- JavaScript dos quatro módulos (apps e filas) validado sintaticamente.
- Respostas simuladas com cadastro, fila e ID correspondente em Disney e Hogwarts.
- API consultada apenas duas vezes (catálogo e espera do parque escolhido) no cenário de teste.
- Painel fechado: **zero reconstruções da lista** ao carregar e em três ciclos de atualização simulados, em ambos os sites.
- Painel aberto: reconstrução inicial e atualizações normais; ao fechar, não reprocessa linhas do DOM.
- Marcadores mapeados, recolocação pelo `moveend` e lista completa preservados.
- Versões de scripts/CSS atualizadas para evitar cache desatualizado do navegador.

### Testes que ainda precisam de dispositivo real

Conferir fluidez do mapa no Android, uso de CPU/GPU e memória no Chrome para Android, carregamento dos tiles OSM, permissões de GPS e resposta da ThemeParks.wiki. Estes serviços podem ter lentidão ou bloqueios externos independentes do código do site.
