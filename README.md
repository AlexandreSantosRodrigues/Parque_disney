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

## Atrações e filas nos sete parques — v2

A mesma experiência de atrações e tempos de espera se aplica agora a todos os parques que aparecem no seletor: Magic Kingdom, EPCOT, Hollywood Studios, Animal Kingdom, Universal Studios Florida, Islands of Adventure e Epic Universe.

**Origem dos dados**: [ThemeParks.wiki V1](https://api.themeparks.wiki/docs/v1), endpoints /v1/entity/{parkId}/children (catálogo, identificadores e coordenadas quando disponíveis) e /v1/entity/{parkId}/live (situação de operação e tempos standby).

- Os dados de catálogo são associados aos tempos pelo **UUID da atração**, não pela comparação frágil dos nomes.
- Apenas atrações com coordenadas publicadas e plausíveis dentro da região do parque recebem um marcador clicável. A coordenada é aproximada e não indica a entrada.
- Outras atrações que existam no catálogo ou apenas na transmissão live continuam visíveis na lista, mas sem botão para localizá-las no mapa.
- A pesquisa no mapa usa as atrações cadastradas no parque selecionado. A seleção abre ficha, situação da fila, distância GPS (quando aplicável) e botão de rota a pé.
- A lista abre em **🎢 Atrações e filas**, com busca, ordenação por menores/maiores tempos e botão **Ver no mapa** para pontos geolocalizados.
- Minutos = queue.STANDBY.waitTime fornecido pela API, quando status OPERATING, leitura válida e atualizada há **até 12 min**. Fechamento, manutenção, ausência de fila ou dado antigo nunca exibem número como atual.
- Uma consulta live por parque a cada 5 minutos no máximo, catálogo com cache de 6 horas, carregamento somente para o parque em uso, sem baixar as sete bases simultaneamente.
- Se o catálogo falhar, preserva os cinco pontos fixos antigos do Magic Kingdom como contingência. Outros parques não recebem pontos fictícios.
- Créditos e links da ThemeParks.wiki permanecem visíveis; a fonte **não é a API oficial da Disney ou da Universal**. Valide tempos relevantes nos aplicativos dos operadores.

**Testes**: a integração passa por verificações de sintaxe, contratos e dados simulados. Validação visual, conectividade e resposta efetiva da API dependem do navegador com acesso à rede.


## Auditoria de 18/10/2026 e separação Disney / Harry Potter

- O site raiz mostra apenas os quatro parques Disney de Orlando. O botão **Estou em Hogwarts** leva ao site independente em `/hogwarts/`, com três áreas Harry Potter da Universal.
- Auditoria estrutural detectou emoji de montanha-russa para qualquer tipo, exclusão de registros `SHOW` e ausência de garantia de cobertura total. Agora `SHOW` é incluído e ícones conhecidos são diferenciados; itens desconhecidos recebem 🎟️.
- As respostas JSON completas do provedor não puderam ser acessadas na auditoria externa; cobertura absoluta e percentuais de atrações **não foram confirmados**. Confira o relatório de auditoria fornecido separadamente.
- O Hogwarts é um segundo frontend estático, com CSS e JavaScript próprios, compartilhando apenas o repositório GitHub Pages. Não é uma página Universal inteira: é exclusivamente o mundo Harry Potter.
