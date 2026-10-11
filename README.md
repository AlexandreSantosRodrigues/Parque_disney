# ParkPath — Maps MVP

Primeiro MVP do ParkPath focado em mapa do Magic Kingdom e geolocalização em movimento. Funciona de qualquer país para validar o GPS antes da viagem.

## O que já faz

- mapa em tela cheia, iniciado no Magic Kingdom;
- solicita localização do usuário;
- acompanha movimento usando `navigator.geolocation.watchPosition()`;
- marcador da posição atual;
- círculo de precisão do GPS;
- indicador de velocidade quando o aparelho fornece esse dado;
- direção de movimento quando o navegador fornece `heading`;
- modo de acompanhamento automático do usuário;
- botões para ir à posição real ou voltar ao Magic Kingdom;
- busca e seleção de cinco atrações no mapa;
- distância em linha reta até a atração selecionada quando o GPS está preciso na região do parque;
- prévia experimental de trajeto a pé consultada somente ao tocar no botão;
- origem de teste escolhida no mapa para validar o fluxo antes da viagem, separada do GPS real;
- nome aproximado de bairro/cidade no canto superior;
- geocodificação reversa limitada por distância e tempo para reduzir consultas.

## Como testar

Abra o endereço HTTPS no celular e permita o acesso à localização. O mapa começará no Magic Kingdom e irá à sua posição quando o GPS responder. Toque em 🏰 para explorar o parque e em ⌖ para retornar à posição real. O botão ◎ liga e desliga o acompanhamento enquanto você caminha.

Toque nos marcadores numerados ou use a busca para ver Space Mountain, Haunted Mansion, Big Thunder Mountain Railroad, Seven Dwarfs Mine Train e Pirates of the Caribbean. Os pontos são coordenadas aproximadas das atrações fornecidas por OpenStreetMap via Queue Times; **não identificam as entradas**. A distância é em linha reta, apenas quando você estiver perto do parque com precisão de GPS suficiente.

Para testar o trajeto do Brasil, selecione uma atração, toque em **Escolher origem de teste** e toque em um caminho do Magic Kingdom. O ponto laranja marca a origem simulada, e o ponto azul continua sendo seu GPS real. Depois toque em **Prévia da rota a pé**. A linha é calculada pelo perfil de pedestres do serviço demonstrativo OSRM/FOSSGIS sobre dados OpenStreetMap. O botão **Usar GPS real** remove a origem simulada; uma rota com GPS real só é solicitada quando a precisão é suficiente e a posição está na região do parque. A rota é estática: mova-se e toque no botão novamente para recalcular.

Para testar movimento de verdade, caminhe alguns metros ao ar livre com a página aberta. O ponto deve se deslocar e o mapa deve acompanhá-lo enquanto o botão `◎` estiver ativo.

> Geolocalização web exige HTTPS (ou localhost). Abrir o `index.html` diretamente como arquivo local pode não permitir GPS em alguns navegadores.

## Observações

Este MVP usa os tiles públicos do OpenStreetMap apenas para prototipagem e testes leves. Antes de crescer o número de usuários, a camada de mapas deve ser revisada conforme a política de uso do provedor. O ponto usado para centralizar o parque é o Castelo da Cinderela; a indicação de que você está na região é aproximada e não delimita o parque.

A geocodificação reversa usa Nominatim público com consultas espaçadas. O GPS continua funcionando independentemente da geocodificação.

**As rotas são prévias experimentais, não navegação para visitantes.** As entradas, bloqueios, passagens internas, acessibilidade e qualidade dos caminhos ainda não foram verificados no parque. O cálculo pode falhar quando o serviço demonstrativo estiver indisponível ou o mapa não tiver conexão. O serviço solicita somente os dois pontos quando o usuário toca no botão, sem atualização automática; a aplicação não armazena histórico de deslocamento. O botão do parque só move a câmera; o ponto azul sempre representa o GPS real. Ainda não há filas.

Referências: [OSRM/FOSSGIS](https://routing.openstreetmap.de/about.html) e [política de uso](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/). O servidor público é para testes leves, com limite agregado de uso; antes de distribuir para muitos visitantes será necessário um serviço com capacidade e termos apropriados.

Fontes dos cinco pontos: `https://queue-times.com/parks/6/rides/{138,140,130,129,137}`. A posição de cada atração deve ser conferida em campo antes do uso para navegação.
