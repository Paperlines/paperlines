<div align="center">

<img src="../../src/assets/logo-128.png" alt="Logotipo de Paperlines" width="112" height="112" />

<h1>Paperlines<br />&#8203;<sup><sub><em>Nanos gigantum humeris insidentes</em></sub></sup></h1>

**Tus artículos, tus notas y cómo se citan entre sí, en una sola app local.**

Un gestor de referencias libre y de código abierto para macOS, Windows y Linux: tus artículos, tus notas y un mapa vivo de cómo se citan entre sí, en una sola app en tu propio ordenador.

<!-- the release workflow points these buttons at each new version -->
<a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_aarch64.pkg"><img src="../assets/readme/download-macos.svg" alt="Descargar para macOS (Apple Silicon)" height="52" /></a> <a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_x64-setup.exe"><img src="../assets/readme/download-windows.svg" alt="Descargar para Windows" height="52" /></a> <a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_amd64.AppImage"><img src="../assets/readme/download-linux.svg" alt="Descargar para Linux (AppImage)" height="52" /></a>

[![Última versión](https://img.shields.io/github/v/release/Paperlines/paperlines?color=0e7490)](https://github.com/Paperlines/paperlines/releases/latest) [![Descargas](https://img.shields.io/github/downloads/Paperlines/paperlines/total?color=0e7490)](https://github.com/Paperlines/paperlines/releases) [![CI](https://github.com/Paperlines/paperlines/actions/workflows/ci.yml/badge.svg)](https://github.com/Paperlines/paperlines/actions/workflows/ci.yml) [![Licencia: AGPL v3+](https://img.shields.io/badge/licence-AGPL--3.0--or--later-0e7490)](../../LICENSE) [![Último commit](https://img.shields.io/github/last-commit/Paperlines/paperlines?color=0e7490)](https://github.com/Paperlines/paperlines/commits/main) [![Estrellas](https://img.shields.io/github/stars/Paperlines/paperlines?style=social)](https://github.com/Paperlines/paperlines/stargazers)

[**Descargar**](#download) · [Funciones](#why-paperlines) · [Línea de comandos y MCP](#command-line-and-ai-assistants) · [Preguntas frecuentes](#questions-people-ask) · [Contribuir](../../.github/CONTRIBUTING.md)

Gratis · Código abierto · Sin cuenta · Sin nube · Sin telemetría

[English](../../README.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [简体中文](README.zh.md) · [日本語](README.ja.md) · [हिन्दी](README.hi.md)

</div>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../assets/readme/hero-dark.png" />
    <img src="../assets/readme/hero-light.png" alt="Paperlines: la biblioteca, una nota de artículo con fórmulas y enlaces, y el lector de PDF uno al lado del otro" width="100%" />
  </picture>
</p>

<a id="why-paperlines"></a>

## Por qué Paperlines

La lectura de investigación ocurre en tres sitios a la vez: un gestor de referencias, una app de notas y un montón de PDF. Paperlines los reúne en una sola ventana, en tu propio ordenador.

- **Reúne.** Suelta PDF, EPUB o carpetas enteras, pega un DOI o un ID de arXiv o PubMed, o importa BibTeX, RIS, CSL-JSON o tu biblioteca de Zotero. Los metadatos se completan con Crossref y OpenAlex, y lo revisas todo antes de guardarlo.
- **Lee y anota.** Un lector de PDF rápido con resaltados en colores que significan algo (idea clave, método, en desacuerdo…), subrayados y selecciones de área. "Citar en la nota" lleva un resaltado a tu nota con un enlace de vuelta a la página.
- **Escribe notas que se enlazan.** Cada artículo tiene una nota; también hay notas libres y de proyecto. Markdown con `[[links]]`, citas `@citekey`, retroenlaces, tablas y fórmulas LaTeX, con formato mientras escribes.
- **Mira cómo se conectan los artículos.** Las listas de referencias se obtienen una vez y se guardan en caché; el grafo de citas muestra cuáles de *tus* artículos citan a cuáles, y se actualiza sin conexión a medida que añades más.
- **Cita en cualquier parte.** Unos 80 estilos de cita, archivos BibTeX que se mantienen al día para LaTeX y exportaciones de todo, incluida la biblioteca completa como una carpeta.
- **Tuyo.** Un archivo SQLite y tus PDF, en la carpeta que elijas. Copias de seguridad diarias, restauración con un clic. Nada sale de tu ordenador salvo las búsquedas que pidas.

## Un grafo de citas para pensar

<p align="center">
  <img src="../assets/readme/graph.png" alt="El grafo de citas en el diseño Árbol, con los artículos clave de un proyecto en pasos numerados" width="100%" />
</p>

- Los artículos flotan en un diseño de fuerzas en vivo: arrastra uno y sus vecinos lo siguen; pasa el ratón por encima para iluminar lo que cita (azul) y lo que lo cita (naranja).
- Relleno con el color del proyecto, borde según el estado de lectura. Filtros por años, etiquetas, proyectos y estado, y un grafo local alrededor de un artículo.
- **Artículos clave (eje):** marca los artículos en los que se apoya un proyecto, paso a paso. El diseño **Árbol** hace crecer el resto del campo a partir de ellos; **Círculo** lo agrupa todo por proyecto y año.
- **Conexiones tipadas** según tu criterio: un artículo *amplía*, *contradice*, *replica* o *aplica el método de* otro, con una nota y un resaltado como evidencia.

## Encuentra qué leer después

<p align="center">
  <img src="../assets/readme/citing.png" alt="Las citas de un artículo y los artículos que lo citan, ordenados por más citados" width="100%" />
</p>

- **Artículos que lo citan:** para cualquier artículo, los 2.000 trabajos más citados que lo citan, de todo OpenAlex. Ordena por **más conectados** para ver los que también citan otros artículos de tu biblioteca, normalmente las mejores lecturas siguientes.
- **Busca en línea** en OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe PMC, DataCite y DOAJ a la vez, en una sola lista que marca lo que ya tienes. Todo gratis.
- Los duplicados se encuentran y se fusionan sin perder ni una nota ni un resaltado.

## Guarda artículos desde el navegador

<p align="center">
  <a href="https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf"><img src="../assets/readme/extension.png" alt="La extensión de Paperlines en la página de un artículo, lista para guardar el artículo y su PDF" width="100%" /></a>
</p>

- **Un clic desde el artículo:** en la página de una revista, arXiv, PubMed o un enlace DOI, el botón de Paperlines muestra el artículo que encontró (título, autores, año, revista, identificadores) y lo guarda con su PDF.
- **Sabe lo que ya tienes:** te avisa cuando un artículo ya está en tu biblioteca; si lo tienes sin PDF, recibe el PDF en lugar de duplicarse.
- **Tus suscripciones funcionan:** el PDF se descarga con tu propia sesión del navegador.
- **Privada:** solo lee una página cuando haces clic, y entrega lo que encuentra a Paperlines en tu equipo, nunca a un servidor. Funciona incluso con la aplicación cerrada.
- **Funciona en** Google Chrome, Microsoft Edge, Brave, Arc, Vivaldi y Chromium.

**👉 [Añade Paperlines a tu navegador](https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf)** y haz clic en **Conectar** en **Ajustes → Extensión del navegador** de la aplicación.

## Trae tu propio asistente de IA

<p align="center">
  <img src="../assets/readme/assistants.png" alt="Ajustes → Asistentes de IA con las tres skills de Paperlines" width="80%" />
</p>

- **Panel del asistente (⌘J):** chatea con tu propio Claude Code o Codex sobre el artículo, el PDF o la nota que tengas abierta. Es de solo lectura hasta que permitas ediciones, y cada cambio que hace se muestra.
- **Conexiones con un clic** para Claude Code, Claude Desktop, Codex, Antigravity, Gemini CLI, Grok y Cursor, a través del servidor MCP integrado, con tres skills: trabajar con tus artículos, escribir notas de artículo estructuradas (cada punto enlazado a su resaltado en el PDF) y buscar los artículos que te faltan.
- Las sugerencias llegan a la bandeja **Artículos sugeridos** de un proyecto. Nada entra en tu biblioteca sin tu clic.

<a id="download"></a>

## Descargar

<!-- the release workflow updates these links to each new version -->
| Plataforma | Instalador | Otros formatos |
| --- | --- | --- |
| **macOS**, Apple Silicon (M1 y posteriores) | [Paperlines_0.1.3_aarch64.pkg](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_aarch64.pkg) | [.dmg](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_aarch64.dmg) |
| **macOS**, Intel | [Paperlines_0.1.3_x64.pkg](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_x64.pkg) | [.dmg](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_x64.dmg) |
| **Windows** 10/11, x64 | [Paperlines_0.1.3_x64-setup.exe](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_x64-setup.exe) (no requiere administrador) | [.msi](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_x64_en-US.msi) |
| **Linux**, x86_64 | [Paperlines_0.1.3_amd64.AppImage](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_amd64.AppImage) | [.deb](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_amd64.deb) · [.rpm](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines-0.1.3-1.x86_64.rpm) · [CLI](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/paperlines-x86_64-unknown-linux-gnu) |
| **Linux**, aarch64 | [Paperlines_0.1.3_aarch64.AppImage](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_aarch64.AppImage) | [.deb](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines_0.1.3_arm64.deb) · [.rpm](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/Paperlines-0.1.3-1.aarch64.rpm) · [CLI](https://github.com/Paperlines/paperlines/releases/download/v0.1.3/paperlines-aarch64-unknown-linux-gnu) |
| **NixOS** | `nix profile install github:Paperlines/paperlines` | consulta las notas de abajo |

Todos los archivos están en la [página de versiones](https://github.com/Paperlines/paperlines/releases/latest). Los paquetes de Linux necesitan glibc 2.35 o posterior (Ubuntu 22.04, Debian 12, Fedora 36 y posteriores).

**Extensión del navegador (Chrome, Edge, Brave, Arc, Vivaldi):** guarda el artículo que estás leyendo, y su PDF, con un clic. [Añádela desde la Chrome Web Store](https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf) y haz clic en **Conectar** en **Ajustes → Extensión del navegador** de la aplicación. También hay un [.zip](https://github.com/Paperlines/paperlines/releases/latest/download/paperlines-browser-extension.zip) para navegadores sin la tienda.

### Actualizaciones, desde la propia app

<p align="center">
  <img src="../assets/readme/update.png" alt="El diálogo de actualización: novedades, quién la hizo, Actualizar ahora o Más tarde" width="420" />
</p>

Cuando sale una versión nueva, Paperlines te avisa la próxima vez que se abre: qué hay de nuevo, quién ha trabajado en ella y **Actualizar ahora** o **Más tarde**. Las actualizaciones están firmadas y se verifican antes de instalarse. La app de macOS, los instaladores de Windows y la AppImage se actualizan solos; las instalaciones `.deb`, `.rpm` y Nix se actualizan con su gestor de paquetes. Desactiva la comprobación en Ajustes → General; el modo sin conexión nunca comprueba.

<details>
<summary>Notas por plataforma: instalador de macOS, Linux, NixOS, COSMIC/Wayland</summary>

**Instalador de macOS.** Abre el `.pkg` y sigue los pasos. Instala Paperlines en Aplicaciones y el comando `paperlines` en `/usr/local/bin`. Para desinstalar, elimina la app y `/usr/local/bin/paperlines`; tu biblioteca se queda donde está.

**Compilaciones de macOS sin firmar.** La primera vez, haz clic derecho en la app, elige **Abrir** y confirma. Las compilaciones firmadas en CI (consulta [Firma](../development.md#signing-and-notarization)) se abren con normalidad.

**Linux.** Los paquetes `.deb` y `.rpm` instalan la CLI como `paperlines`. Con la AppImage, pon el archivo separado `paperlines-<triple>` en tu PATH, o usa **Ajustes → Línea de comandos → Instalar herramienta de línea de comandos**.

**NixOS.** El repositorio es un flake que compila la app y la CLI desde el código fuente (x86_64 y aarch64):

```sh
nix run github:Paperlines/paperlines            # try it
nix profile install github:Paperlines/paperlines
```

En una configuración de NixOS o home-manager, añade el flake como input y usa su overlay:

```nix
nixpkgs.overlays = [ inputs.paperlines.overlays.default ];
environment.systemPackages = [ pkgs.paperlines ];   # or home.packages
```

Esto instala la app con su entrada de escritorio y su icono, y el comando `paperlines`. Notas:
- Las claves de API van al Secret Service. Activa uno (`services.gnome.gnome-keyring.enable = true;`, o KeePassXC); sin él se guardan en un archivo cifrado.
- La AppImage no funciona en NixOS tal cual; usa el flake (o `appimage-run`).

**COSMIC (y otros escritorios Wayland).** Preparado para COSMIC, pero aún no probado en él, así que los informes son bienvenidos:
- El modo claro/oscuro sigue el ajuste del escritorio (leído del portal de escritorio XDG, que usan COSMIC, GNOME y KDE), incluso si cambia con la app abierta. Eso es lo que significa el tema **Sistema** en Ajustes.
- La ventana tiene un ID de app correcto, así que el dock muestra el icono adecuado y agrupa la ventana con su lanzador.
- Con el controlador de NVIDIA en Wayland, el renderizador DMA-BUF de WebKitGTK se desactiva automáticamente (ahí muestra una ventana en blanco). Define `WEBKIT_DISABLE_DMABUF_RENDERER=0` para mantenerlo activado.
- Los diálogos de archivo son los de GTK. La ventana no tiene barra de título ni barra de menús del sistema: la barra superior de Paperlines tiene los botones de la ventana, y se arrastra para mover la ventana.

</details>

<a id="command-line-and-ai-assistants"></a>

## Línea de comandos y asistentes de IA

El comando `paperlines` trabaja con la misma biblioteca que la app. El `.pkg` de macOS lo instala; en otros sistemas usa **Ajustes → Línea de comandos → Instalar herramienta de línea de comandos**.

<details>
<summary>Comandos</summary>

El `.pkg` de macOS lo instala por ti. Si no, usa **Ajustes → Línea de comandos → Instalar herramienta de línea de comandos**. En macOS enlaza la CLI incluida en la app en `~/.local/bin/paperlines`. Después:

```sh
paperlines search 'tag:ml year:>=2020 attention'
paperlines show vaswani2017attention          # metadata, counts and the paper note
paperlines note devlin2019bert --add 'Masked LM pre-training'
paperlines cites devlin2019bert               # library papers it cites (also: cited-by)
paperlines add paper.pdf 10.1038/nature14539 refs.bib --fetch-refs
paperlines export -f bibtex --project Thesis -o thesis.bib
paperlines export-notes ~/notes-export
paperlines fetch-refs                         # every paper without a reference list
paperlines doctor [--fix]                     # integrity, files, edges, search index
paperlines backup [--list | --restore FILE --yes]
paperlines cite vaswani2017attention --style ieee   # -b for a reference list; `paperlines styles` lists styles
paperlines rm KEY... / paperlines trash [list | restore KEY... | empty [--older-than DAYS]]
paperlines citing vaswani2017attention -s connected   # papers anywhere citing it (also: cited, newest)
paperlines relate chen2022 extends smith2021 --note "same loss"   # also: unrelate, relations [KEY], relation-types
paperlines duplicates [--merge | --dismiss]
paperlines find-pdf [KEY...]                  # open-access PDFs via OpenAlex
paperlines import-zotero [~/Zotero] / paperlines import-dump library.json
paperlines auto-export add -f bibtex thesis.bib [--project Thesis]
paperlines paths [--set-library DIR]
```

Todos los comandos aceptan `--json`. `--library DIR` o `PAPERLINES_LIBRARY=DIR` selecciona otra biblioteca. La CLI, la app y el servidor MCP comparten una sola implementación (`crates/ops`), así que sus resultados son idénticos.

</details>

<details>
<summary>Servidor MCP para Claude Code, Claude Desktop y otros</summary>

```sh
claude mcp add paperlines -- paperlines mcp
```

Claude Desktop: añade esto a `claude_desktop_config.json`:

```json
{ "mcpServers": { "paperlines": { "command": "paperlines", "args": ["mcp"] } } }
```

Herramientas: `search_library`, `get_item`, `get_paper_note`, `list_citations`, `find_citing_papers`, `list_relations`, `export_bibliography` (todas de solo lectura; `find_citing_papers` usa la red salvo que su respuesta esté en caché), `add_bullet` (añade un punto a una nota de artículo) y `add_relation` (registra una conexión tipada que el usuario ha pedido). El servidor solo se comunica por stdin y stdout.

</details>

<a id="questions-people-ask"></a>

## Preguntas frecuentes

<details>
<summary>¿Necesito una cuenta? ¿Se envía algo a la nube?</summary>

Sin cuenta, sin nube, sin telemetría. La biblioteca es una carpeta en tu ordenador. Las únicas peticiones de red son las búsquedas de metadatos, referencias y artículos que citan (Crossref, OpenAlex, Semantic Scholar, arXiv) cuando añades artículos o las pides, que envían identificadores como un DOI, y una petición a GitHub al abrir la app, para ver si hay una versión nueva. **Ajustes → Modo sin conexión** lo desactiva todo.

</details>

<details>
<summary>¿Puedo pasarme desde Zotero?</summary>

Sí. **Añadir → Importar de Zotero** trae los artículos con sus PDF, colecciones (como proyectos), etiquetas, notas y resaltados. Primero se copia la base de datos de Zotero, que nunca se modifica, así que puedes seguir usando ambos.

</details>

<details>
<summary>¿Dónde están mis datos y cómo hago copia de seguridad?</summary>

| | macOS | Linux |
| --- | --- | --- |
| Biblioteca (base de datos, `pdfs/`, `backups/`; se puede mover en **Ajustes → Biblioteca**) | `~/Library/Application Support/Paperlines/` | `$XDG_DATA_HOME/paperlines/` (por defecto `~/.local/share/paperlines/`) |
| Configuración (alternativa para las claves de API) | `~/Library/Application Support/Paperlines/` | `$XDG_CONFIG_HOME/paperlines/` |
| Caché | `~/Library/Caches/Paperlines/` | `$XDG_CACHE_HOME/paperlines/` |

- **La biblioteca** es un archivo SQLite (WAL, FTS5) más los PDF guardados por hash de contenido. Los archivos originales se copian dentro y nunca se modifican.
- **Carpetas en la nube.** Si guardas la biblioteca en iCloud Drive o Dropbox, cierra la app antes de sincronizar. Un cliente de nube no debe sincronizar una base de datos SQLite abierta.
- **Claves de API.** Las claves (Semantic Scholar y OpenAlex, ambas opcionales) van al Llavero de macOS o al Secret Service de Linux. Sin Secret Service, van a un archivo cifrado en la carpeta de configuración.

Se hace una copia de seguridad cada día y antes de cada actualización; **Ajustes → Biblioteca** restaura una con un clic, y `paperlines backup` hace lo mismo desde una terminal.

</details>

<details>
<summary>¿Funciona con LaTeX?</summary>

Sí. Copia citas en unos 80 estilos, exporta BibTeX, CSL-JSON o RIS, y usa **Mantener este archivo actualizado** para reescribir un archivo `.bib` cada vez que cambia la biblioteca, como Better BibTeX.

</details>

<details>
<summary>Todo lo que hace Paperlines</summary>

- **Biblioteca.** Añade artículos soltando PDF, EPUB o carpetas, o a partir de DOI, ID de arXiv y archivos BibTeX, RIS o CSL-JSON. Cada archivo aparece por título y autor, no por nombre de archivo. Los metadatos salen del archivo (información del PDF, datos del paquete EPUB) y se completan con Crossref u OpenAlex. Un PDF sin DOI se identifica por el texto de su primera página. Lo revisas todo antes de guardarlo. La biblioteca es una tabla ordenable (título, autor, año, fecha de adición), y todos los campos al estilo de Zotero se pueden editar: volumen, número, páginas, editorial, lugar, ISBN/ISSN, edición, serie y editores.
- **Importar de Zotero.** Trae los artículos con sus PDF, colecciones (como proyectos), etiquetas, notas y resaltados. Primero se copia la base de datos de Zotero, que nunca se modifica. También se puede importar un volcado JSON de esta app.
- **Duplicados y Papelera.** Una vista de Duplicados encuentra artículos con el mismo PDF, o con casi el mismo título en el mismo año. Fusiónalos en uno, conservando cada nota, resaltado, etiqueta y archivo. Eliminar mueve los artículos a la Papelera (con Deshacer); se vacía sola tras 30 días (configurable).
- **Búsqueda.** La búsqueda de texto completo cubre títulos, autores, resúmenes, notas y resaltados, con calificadores: `tag:ml/nlp project:"Thesis" author:hinton year:>=2020 is:unread has:pdf cites:<citekey> cited-by:<citekey>`, y `-` excluye un término. Las búsquedas se pueden guardar.
- **Organiza.** Etiquetas jerárquicas con color (renombrar y fusionar), proyectos, estado de lectura, valoraciones y una paleta de comandos (⌘K / Ctrl+K).
- **Lee.** Un lector PDF.js con resaltados, subrayados y selecciones de área. Los colores de resaltado tienen significado (amarillo = idea clave, etc.). "Citar en la nota" copia un resaltado en la nota del artículo con un enlace de vuelta a la página. "Exportar PDF anotado" escribe una copia; el original nunca se modifica.
- **Añadido rápido.** Pega un DOI, un ID de arXiv o PubMed, o un título en el cuadro de la barra superior y pulsa Enter para revisarlo y añadirlo; el botón al final tiene las demás vías (archivos, carpetas, BibTeX, Zotero, una biblioteca exportada, búsqueda en línea).
- **Notas de artículo.** Cada artículo tiene una nota. Su cabecera (título, autores, fechas) se genera a partir del artículo; el cuerpo son tus puntos. Las notas son Markdown con `[[links]]` a otras notas y artículos (al escribir `[[` aparecen sugerencias, y una nota nueva cuando nada coincide; al seguir el enlace se crea la nota), `@citekey`, fórmulas y retroenlaces. Las fórmulas son LaTeX: `$…$` en línea y `$$…$$` para una fórmula centrada, también en varias líneas, mostradas con KaTeX. Dentro de una fórmula, al escribir `\` se completan los comandos con su símbolo (`\al` → `\alpha` α), y la barra de herramientas del editor tiene títulos y encabezados, negrita, cursiva, tachado y código, listas con viñetas, numeradas y de tareas, y citas en bloque (con atajos: ⌘B, ⌘I, ⌘E, ⌘⇧X, ⌘⇧8/7/9, ⌘⌥1–3; cada botón activa y desactiva, y Enter continúa una lista), un botón de enlace, botones de fórmula en línea y en bloque, y una paleta **Ω** de letras griegas, operadores, relaciones, flechas, símbolos de conjuntos y lógica, y acentos. Vista previa en vivo: el Markdown y las fórmulas se muestran con formato mientras escribes, salvo donde estás editando. Las notas libres y las de proyecto funcionan igual.
- **Búsqueda en línea.** Una sola búsqueda en OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe PMC (ciencias de la vida, con texto completo gratuito), DataCite (conjuntos de datos, software y preprints) y DOAJ (revistas de acceso abierto), en una sola lista ordenada; activa y desactiva fuentes, mira qué artículos ya tienes y mapea los resultados en el grafo de un proyecto. Todo gratis; solo OpenAlex y Semantic Scholar admiten una clave opcional.
- **Grafo de citas.** Las listas de referencias se obtienen una vez (OpenAlex, luego Semantic Scholar, o tu propio servidor GROBID) y se guardan en caché; OpenCitations, un índice de citas abierto, añade las referencias que se les escaparon y los sustituye cuando ninguno conoce un artículo. En el grafo solo aparecen los artículos de tu biblioteca. Los artículos que añadas después se enlazan sin conexión desde la caché. Puedes añadir o quitar enlaces a mano, y al recalcular se respetan esas decisiones.
- **Vista de grafo.** Los artículos son cajas redondeadas rotuladas con el primer autor y el año ("Smith ’21"), o como puntos. Un diseño de fuerzas en vivo: los artículos flotan y se asientan, arrastrar uno tira de sus vecinos, los rótulos aparecen al acercar el zoom, y al pasar el ratón se iluminan las citas de un artículo (azul: cita a, naranja: lo cita) y se atenúa el resto. Los artículos se rellenan con el color de su proyecto y tienen un borde según el estado de lectura; la selección y el foco del teclado dibujan un contorno alrededor de la caja, y una pequeña leyenda en el lienzo explica qué significan los colores. El engranaje acopla los ajustes del grafo junto al grafo (ensanchándolo antes si el panel es estrecho): **Filtros** (búsqueda, artículos sin enlaces, años, etiqueta, proyecto, estado, grafo local alrededor del artículo seleccionado), **Grupos** (color por proyecto, etiqueta o estado; anillo de estado; leyenda), **Visualización** (cajas o puntos, diseño de fuerzas o por año, rótulos, flechas, atenuación del texto, tamaño de nodo, grosor de enlace, mapa general) y **Fuerzas** (central, repulsión, fuerza de enlace, distancia de enlace). Al pasar el ratón por un artículo se muestra su tarjeta de nota; haz clic para fijarla y editarla; doble clic o Enter abre el PDF.
- **Conexiones tipadas.** Registra cómo se relacionan los artículos, según tu criterio: uno *amplía*, *contradice*, *replica* o *aplica el método de* otro, o un tipo que tú definas (p. ej. *respalda* / *respaldado por*). Cada conexión se lee correctamente desde ambos artículos ("Amplía" / "Ampliado por"), puede llevar una nota y un resaltado del PDF como evidencia, y aparece en el grafo como un enlace de color con rótulo que se puede filtrar por tipo. Añádelas desde la pestaña Citas de un artículo, el menú contextual, ⌘K, o en el grafo arrastrando con ⌥ de un artículo a otro. También `paperlines relate chen2022 extends smith2021` y las herramientas MCP `list_relations` / `add_relation`.
- **Artículos que lo citan.** Para cualquier artículo con DOI o ID de arXiv, mira quién lo cita, de todo OpenAlex (con Semantic Scholar como alternativa): los 2.000 más citados, ordenables por citas, fecha o **más conectados**, es decir, los artículos que también citan otros artículos de tu biblioteca, normalmente las mejores lecturas siguientes. Filtra, marca cuáles ya están en tu biblioteca y añade los que quieras con la revisión de importación. Se guardan una semana; `paperlines citing` y el servidor MCP hacen lo mismo.
- **Artículos clave (eje).** Marca los artículos en los que se apoya un proyecto, paso a paso: la idea y luego lo que se construyó sobre ella. Un paso puede contener varios artículos (dos grupos que descubrieron lo mismo a la vez). Constrúyelo en el diálogo del proyecto o con clic derecho en un artículo → *Añadir al eje*. El grafo dibuja los artículos clave como cajas ámbar numeradas por paso (①, ②…), unidas por un camino dorado. Dos diseños más lo usan: **Árbol** crece de izquierda a derecha desde el eje, cada paso es una caja con nombre en el tronco y cada otro artículo cuelga del artículo clave más cercano; **Círculo** pone todos los artículos en un anillo, agrupados por proyecto y ordenados por año (puntos a partir de 150 artículos). También `paperlines spine "Thesis" add smith2018 --step 1`.
- **Panel del asistente.** ⌘J (o el botón del asistente) abre un chat con tu propio **Claude Code** o **Codex**, con tu propia cuenta, así que no hay que configurar ninguna clave de API. El panel ofrece los agentes que hayas conectado en Ajustes ▸ Asistentes de IA; cambia entre ellos desde su cabecera (al cambiar se empieza un chat nuevo). Solo ve tu biblioteca de Paperlines, con las mismas herramientas que el servidor MCP. Sabe qué artículo, PDF o nota tienes abierto y sugiere cosas que preguntar al respecto. Sus pasos se pliegan en una línea que puedes abrir, y los enlaces `@citekey` y de resaltados en sus respuestas abren el artículo o la página. Es de **Solo lectura** hasta que lo cambias a **Puede editar**; entonces puede escribir notas, resaltados, conexiones y sugerencias (nunca elimina nada), y cada cambio que hace se muestra en el chat.
- **Apariencia.** Ajustes ▸ Apariencia: tema, color de acento (verde azulado, azul, violeta, verde, ámbar, rosa), diseño (barra lateral y asistente a cualquier lado: Clásico, Invertido, ambos a la izquierda, ambos a la derecha), iconos finos o normales, y rótulos opcionales bajo los iconos de la barra superior.
- **Asistentes de IA.** Ajustes → Asistentes de IA conecta el servidor MCP integrado con Claude Code, Claude Desktop, Codex, Antigravity, Gemini CLI, Grok y Cursor con un clic (edita la configuración de cada asistente, o usa su propio comando `mcp add`, conservando todo lo demás), e instala tres skills: **paperlines** (trabajar con tus artículos), **paperlines-notes** (escribir notas de artículo en tu formato Idea clave / Método / Por qué importa, o argumento por argumento: resalta en el PDF la frase que sostiene cada argumento, en el color de su significado, y enlaza cada punto de la nota con su resaltado; también síntesis de proyectos y borradores de trabajo relacionado; muestra el texto y pregunta antes de guardar, y nunca sobrescribe) y **paperlines-scout** (encontrar los artículos que te faltan). El asistente ve tus proyectos y de qué trata tu biblioteca, lee el PDF de un artículo, resalta pasajes citándolos (el lector los coloca en la página la próxima vez que se abra el PDF) y puede crear notas o añadir contenido a ellas. La app recoge lo que haya cambiado cada vez que su ventana vuelve al frente. Pregúntale qué leer después: sugiere artículos con sus motivos (citado por varios artículos de tu proyecto, que cita a varios de ellos, relacionado o que coincide con un tema) y los pone en la bandeja **Artículos sugeridos** del proyecto, donde añades o descartas cada uno; nada entra en tu biblioteca sin tu clic, y los artículos descartados no vuelven. También `paperlines suggest --project NAME [--topic …] [--post]` y `paperlines projects`.
- **Pestañas y diseños.** Los PDF, las notas y el grafo se abren como pestañas. Tres diseños: solo biblioteca, biblioteca con lector y solo lector.
- **Cita.** Copia una cita (⌘⇧C) o una entrada bibliográfica (⌘⇧B) en cualquiera de los unos 80 estilos CSL incluidos (APA, Chicago, IEEE, Nature, Vancouver…). Se pega como texto enriquecido en Word o Google Docs. **Buscar PDF de acceso abierto** obtiene una copia legal a través de OpenAlex.
- **Exportación.** BibTeX, CSL-JSON, RIS, una lista de referencias en Markdown, una bibliografía con formato (HTML, en cualquier estilo) y una carpeta de notas en Markdown. **Biblioteca completa** escribe una carpeta, `library.json` más `pdfs/`, con todo: artículos y sus PDF, notas, resaltados, etiquetas, proyectos con sus colores y artículos clave, el grafo de citas (incluidos los enlaces que pusiste a mano) y las conexiones tipadas con su evidencia. **Añadir ▸ Importar biblioteca…** la lleva a otra biblioteca (en otro ordenador, o fusionándola con una existente: los artículos que ya están se omiten). También `paperlines export-library DIR` y `paperlines import-dump FOLDER`. **Mantener este archivo actualizado** reescribe un archivo `.bib` (u otro) cada vez que cambia la biblioteca, como Better BibTeX, para que los proyectos de LaTeX estén al día.
- **Ayuda donde la necesitas.** Los botones ⓘ en Ajustes y junto a la búsqueda, la Papelera y los Duplicados explican cada opción.
- **Seguridad.** Una copia de seguridad diaria con restauración en un clic, una copia antes de cada actualización del esquema, transacciones en todas partes y `doctor`.
- **Línea de comandos y MCP.** La CLI `paperlines` y un servidor MCP para que Claude Code o Claude Desktop puedan buscar en tu biblioteca y añadir puntos a las notas de artículo. Se ejecuta localmente por stdio, nunca en la red.

El único acceso a la red son las búsquedas de metadatos, referencias y artículos que citan (Crossref, OpenAlex, Semantic Scholar, arXiv), y solo cuando añades artículos o las pides, más una petición a GitHub al abrir la app para ver si hay una versión nueva (Ajustes → General la desactiva). Solo se envían identificadores (DOI, ID de arXiv). Una clave de API gratuita de OpenAlex (Ajustes → Citas) te da tu propia cuota diaria; sin ella, las búsquedas comparten una pequeña cuota con tu red. **Ajustes → Modo sin conexión** lo desactiva todo.

</details>

## Compilar desde el código fuente

Requisitos previos:

- Node 26+, pnpm 12.21 (versión exacta en `package.json`), Rust mediante rustup (versión fijada en `rust-toolchain.toml`)
- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Debian/Ubuntu:** `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsecret-1-dev patchelf build-essential curl file`
- **Fedora:** `sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel libsecret-devel openssl-devel`
- **Arch:** `sudo pacman -S webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg libsecret base-devel`

```sh
pnpm install
pnpm tauri dev        # run the app (builds the CLI sidecar first)
pnpm tauri build      # macOS: .app + .dmg; Linux: .deb, .rpm, AppImage
pnpm build:pkg        # macOS: the .pkg installer, from the .app built above
```

Para una compilación universal de macOS, ejecuta `rustup target add x86_64-apple-darwin aarch64-apple-darwin` y luego `pnpm tauri build --target universal-apple-darwin`.

Las comprobaciones, la arquitectura y las convenciones están en [docs/development.md](../development.md) y [docs/architecture.md](../architecture.md).

## Más información

- [Novedades](../CHANGELOG.md): los cambios de cada versión
- [Desarrollo](../development.md): comprobaciones, publicaciones, firma, Nix, Windows, cambio de nombre
- [Arquitectura](../architecture.md): cómo está organizado el código y por qué
- [Contribuir](../../.github/CONTRIBUTING.md): cómo ayudar

## Comunidad

Los informes de errores, las ideas y los pull requests son bienvenidos: [abre una incidencia](https://github.com/Paperlines/paperlines/issues) o lee [CONTRIBUTING.md](../../.github/CONTRIBUTING.md) para empezar. Gracias a todas las personas que han contribuido:

<a href="https://github.com/Paperlines/paperlines/graphs/contributors"><img src="https://contrib.rocks/image?repo=Paperlines/paperlines" alt="Colaboradores" /></a>

Si Paperlines te ayuda en tu investigación, una ⭐ en GitHub ayuda a que otros investigadores lo encuentren.

## Citar Paperlines

<details>
<summary>BibTeX</summary>

```bibtex
@software{paperlines,
  author  = {{The Paperlines contributors} and Yoav Yosif-Or},
  title   = {{Paperlines}: a local-first reference manager},
  year    = {2026},
  url     = {https://github.com/Paperlines/paperlines},
  license = {AGPL-3.0-or-later}
}
```

**Ayuda e información → Cita Paperlines en tu artículo** en la app da la entrada con tu versión exacta, y también en APA.

</details>

## Licencia

Copyright © 2026 los colaboradores de Paperlines y Yoav Yosif-Or. Paperlines es software libre bajo la [GNU Affero General Public License v3.0 o posterior](../../LICENSE): puedes usarlo, estudiarlo, compartirlo y modificarlo, y si distribuyes una versión modificada (incluido ejecutarla como servicio de red), debes compartir tus cambios bajo la misma licencia.

<sub>Claude, Codex, Gemini, Antigravity, Grok y Cursor son marcas comerciales de sus respectivos propietarios. Sus nombres e iconos aparecen solo para mostrar con qué herramientas funciona Paperlines, no como respaldo. Los iconos de los asistentes proceden de [Lobe Icons](https://github.com/lobehub/lobe-icons) (licencia MIT, consulta `src/assets/agents/LICENSE-lobe-icons.txt`).</sub>

---

<p align="center">
  Creado por <a href="https://github.com/yoav-yosifor"><strong>Yoav Yosif-Or</strong></a>
</p>
