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
- nome aproximado de bairro/cidade no canto superior;
- geocodificação reversa limitada por distância e tempo para reduzir consultas.

## Como testar

Abra o endereço HTTPS no celular e permita o acesso à localização. O mapa começará no Magic Kingdom e irá à sua posição quando o GPS responder. Toque em 🏰 para explorar o parque e em ⌖ para retornar à posição real. O botão ◎ liga e desliga o acompanhamento enquanto você caminha.

Para testar movimento de verdade, caminhe alguns metros ao ar livre com a página aberta. O ponto deve se deslocar e o mapa deve acompanhá-lo enquanto o botão `◎` estiver ativo.

> Geolocalização web exige HTTPS (ou localhost). Abrir o `index.html` diretamente como arquivo local pode não permitir GPS em alguns navegadores.

## Observações

Este MVP usa os tiles públicos do OpenStreetMap apenas para prototipagem e testes leves. Antes de crescer o número de usuários, a camada de mapas deve ser revisada conforme a política de uso do provedor. O ponto usado para centralizar o parque é o Castelo da Cinderela; a indicação de que você está na região é aproximada e não delimita o parque.

A geocodificação reversa usa Nominatim público com consultas espaçadas. O GPS continua funcionando independentemente da geocodificação.

Ainda não há rotas a pé, atrações próprias, filas ou simulação de localização. O botão do parque só move a câmera; o ponto azul sempre representa o GPS real.
