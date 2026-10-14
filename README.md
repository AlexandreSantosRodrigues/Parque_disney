# ParkPath — Maps MVP

Primeiro MVP do ParkPath focado exclusivamente em mapa e geolocalização em movimento.

## O que já faz

- mapa em tela cheia;
- solicita localização do usuário;
- acompanha movimento usando `navigator.geolocation.watchPosition()`;
- marcador da posição atual;
- círculo de precisão do GPS;
- indicador de velocidade quando o aparelho fornece esse dado;
- direção de movimento quando o navegador fornece `heading`;
- modo de acompanhamento automático do usuário;
- botão para recentralizar;
- nome aproximado de bairro/cidade no canto superior;
- geocodificação reversa limitada por distância e tempo para reduzir consultas.

## Como testar

Publique no GitHub Pages e abra o endereço HTTPS no celular. Permita o acesso à localização.

Para testar movimento de verdade, caminhe alguns metros ao ar livre com a página aberta. O ponto deve se deslocar e o mapa deve acompanhá-lo enquanto o botão `◎` estiver ativo.

> Geolocalização web exige HTTPS (ou localhost). Abrir o `index.html` diretamente como arquivo local pode não permitir GPS em alguns navegadores.

## Observações

Este MVP usa os tiles públicos do OpenStreetMap apenas para prototipagem e testes leves. Antes de crescer o número de usuários, a camada de mapas deve ser revisada conforme a política de uso do provedor.

A geocodificação reversa usa Nominatim público com consultas espaçadas. O GPS continua funcionando independentemente da geocodificação.
