# Auditoria técnica do ParkPath — 18/10/2026

**A auditoria foi realizada antes de modificar a versão publicada.** Base: commit `81c7c056ead28366ac04f1707d98eeaf8b3c07bc`.

## Escopo e achados

| Verificação | Situação na versão auditada | Ação |
|---|---|---|
| Complexos | 4 Disney + 3 Universal no mesmo seletor | Separar Disney do site temático de Hogwarts |
| Classificação | Marcador `🎢` era usado indistintamente para tudo em `queues.js / makeIcon` | Categorias documentadas e marcador neutro quando desconhecida |
| Experiências | Consulta filtrava apenas `entityType === "ATTRACTION"` | Incluir também `SHOW`; evitar prometer que há fila para todos |
| Magic Kingdom | Cinco pontos fixos locais usados em contingência | Preservar fallback |
| Demais pontos | Coordenadas precisam existir no provedor e passar filtro de proximidade | Não inventar posição |
| Espera | `queue.STANDBY.waitTime` com estado e atualização <= 12min | Manter atribuição, frescor e indisponibilidade |
| GPS e rotas | GPS do navegador, Leaflet, OSM e roteador externo | Preservar e avisar sobre limites |
| Tamanho | Controles existentes de 144 × 144 pixels | Preservar |
| Cobertura real | Total de atrações por parque não verificado | Não declarar 100% |

## Limitações da cobertura

O projeto tinha **sete entradas de parque**, o que **não comprova cobertura completa das atrações**. Não foi possível obter nesta sessão as respostas JSON completas de `GET /v1/entity/{id}/children` e `GET /v1/entity/{id}/live` para confrontar contagens reais por parque. A execução de testes simulados verifica a lógica, não a disponibilidade atual do provedor.

A ThemeParks.wiki distingue `ATTRACTION`, `SHOW` e `RESTAURANT`. A fonte pode não publicar coordenadas, fila ou horário para todos os itens. Marcadores representam posições aproximadas e **não necessariamente entradas oficiais**.

## Referências

- https://api.themeparks.wiki/docs/v1/
- https://github.com/ThemeParks/parksapi
- https://www.universalorlando.com/web/en/us/theme-parks/islands-of-adventure/the-wizarding-world-of-harry-potter-hogsmeade/
- https://www.universalorlando.com/web/en/us/theme-parks/universal-studios-florida/the-wizarding-world-of-harry-potter-diagon-alley/
- https://www.universalorlando.com/web/en/us/epic-universe/worlds/the-wizarding-world-of-harry-potter-ministry-of-magic

## Destino da atualização posterior

1. ParkPath principal fica com quatro parques Disney e o link superior direito **Estou em Hogwarts**.
2. Um frontend próprio em `/hogwarts/` oferece três áreas de Harry Potter: Hogsmeade, Beco Diagonal e Ministério da Magia.
3. O guia Hogwarts relaciona **10 experiências explicitamente identificadas** em páginas oficiais da Universal, sem afirmar que isso equivale a todos os encontros, lojas, eventos e atrações sazonais.
4. Onde a API não retornar pontos e esperas, o app informa a ausência, sem fabricar dados.
5. Permanecem pendentes os testes visuais em dispositivos e a verificação de CORS da API no site real.
