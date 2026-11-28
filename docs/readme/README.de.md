<div align="center">

<img src="../../src/assets/logo-128.png" alt="Paperlines-Logo" width="112" height="112" />

<h1>Paperlines<br />&#8203;<sup><sub><em>Nanos gigantum humeris insidentes</em></sub></sup></h1>

**Ihre Paper, Ihre Notizen und wie sie einander zitieren, in einer lokalen App.**

Eine kostenlose Open-Source-Literaturverwaltung für macOS, Windows und Linux: Ihre Paper, Ihre Notizen und eine lebendige Karte, wie sie einander zitieren, in einer App auf Ihrem eigenen Computer.

<!-- the release workflow points these buttons at each new version -->
<a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.dmg"><img src="../assets/readme/download-macos.svg" alt="Für macOS herunterladen (Apple Silicon)" height="52" /></a> <a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64-setup.exe"><img src="../assets/readme/download-windows.svg" alt="Für Windows herunterladen" height="52" /></a> <a href="https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_amd64.AppImage"><img src="../assets/readme/download-linux.svg" alt="Für Linux herunterladen (AppImage)" height="52" /></a>

[![Neueste Version](https://img.shields.io/github/v/release/Paperlines/paperlines?color=0e7490)](https://github.com/Paperlines/paperlines/releases/latest) [![Downloads](https://img.shields.io/github/downloads/Paperlines/paperlines/total?color=0e7490)](https://github.com/Paperlines/paperlines/releases) [![CI](https://github.com/Paperlines/paperlines/actions/workflows/ci.yml/badge.svg)](https://github.com/Paperlines/paperlines/actions/workflows/ci.yml) [![Lizenz: AGPL v3+](https://img.shields.io/badge/licence-AGPL--3.0--or--later-0e7490)](../../LICENSE) [![Letzter Commit](https://img.shields.io/github/last-commit/Paperlines/paperlines?color=0e7490)](https://github.com/Paperlines/paperlines/commits/main) [![Sterne](https://img.shields.io/github/stars/Paperlines/paperlines?style=social)](https://github.com/Paperlines/paperlines/stargazers)

[**Herunterladen**](#download) · [Funktionen](#why-paperlines) · [Kommandozeile und MCP](#command-line-and-ai-assistants) · [FAQ](#questions-people-ask) · [Mitmachen](../../.github/CONTRIBUTING.md)

Kostenlos · Open Source · Kein Konto · Keine Cloud · Keine Telemetrie

[English](../../README.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch** · [简体中文](README.zh.md) · [日本語](README.ja.md) · [हिन्दी](README.hi.md)

</div>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../assets/readme/hero-dark.png" />
    <img src="../assets/readme/hero-light.png" alt="Paperlines: die Bibliothek, eine Paper-Notiz mit Formeln und Links und der PDF-Reader nebeneinander" width="100%" />
  </picture>
</p>

<a id="why-paperlines"></a>

## Warum Paperlines

Wissenschaftliches Lesen findet an drei Orten gleichzeitig statt: in einer Literaturverwaltung, einer Notiz-App und einem Stapel PDFs. Paperlines bringt sie in ein Fenster, auf Ihrem eigenen Computer.

- **Sammeln.** Ziehen Sie PDFs, EPUBs oder ganze Ordner hinein, fügen Sie eine DOI, arXiv- oder PubMed-ID ein, oder importieren Sie BibTeX, RIS, CSL-JSON oder Ihre Zotero-Bibliothek. Metadaten werden über Crossref und OpenAlex ergänzt, und Sie prüfen alles, bevor es gespeichert wird.
- **Lesen und annotieren.** Ein schneller PDF-Reader mit Markierungen in Farben, die etwas bedeuten (Kernidee, Methode, Widerspruch…), Unterstreichungen und Bereichsauswahlen. „In Notiz zitieren“ übernimmt eine Markierung in Ihre Notiz, mit einem Link zurück zur Seite.
- **Notizen, die verlinken.** Jedes Paper hat eine Notiz; dazu freie Notizen und Projektnotizen. Markdown mit `[[links]]`, `@citekey`-Zitaten, Backlinks, Tabellen und LaTeX-Formeln, gerendert beim Tippen.
- **Sehen, wie Paper zusammenhängen.** Literaturlisten werden einmal abgerufen und zwischengespeichert; der Zitationsgraph zeigt, welche *Ihrer* Paper welche zitieren, und aktualisiert sich offline, wenn Sie weitere hinzufügen.
- **Überall zitieren.** Rund 80 Zitierstile, BibTeX-Dateien, die für LaTeX aktuell bleiben, und Exporte von allem, auch der ganzen Bibliothek als ein Ordner.
- **Ihre Daten.** Eine SQLite-Datei und Ihre PDFs, in einem Ordner Ihrer Wahl. Tägliche Backups, Wiederherstellung mit einem Klick. Nichts verlässt Ihren Computer außer den Abfragen, die Sie anstoßen.

## Ein Zitationsgraph, mit dem man denken kann

<p align="center">
  <img src="../assets/readme/graph.png" alt="Der Zitationsgraph im Baum-Layout, mit den Schlüsselpapern eines Projekts in nummerierten Schritten" width="100%" />
</p>

- Paper schweben in einem lebendigen Kräfte-Layout: Ziehen Sie eines, und seine Nachbarn folgen; beim Darüberfahren leuchtet auf, was es zitiert (blau) und wovon es zitiert wird (orange).
- Gefüllt mit der Projektfarbe, umrandet nach Lesestatus. Filter für Jahre, Tags, Projekte, Status und ein lokaler Graph um ein Paper.
- **Schlüsselpaper (Rückgrat):** Markieren Sie Schritt für Schritt die Paper, auf denen ein Projekt ruht. Das **Baum**-Layout lässt den Rest des Feldes aus ihnen wachsen; **Kreis** gruppiert alles nach Projekt und Jahr.
- **Typisierte Verbindungen** nach Ihrem eigenen Urteil: Ein Paper *erweitert* ein anderes, *widerspricht* ihm, *repliziert* es oder *wendet seine Methode an*, mit einer Notiz und einer Markierung als Beleg.

## Finden, was Sie als Nächstes lesen

<p align="center">
  <img src="../assets/readme/citing.png" alt="Die Zitationen eines Papers und die Paper, die es zitieren, nach Zitationen sortiert" width="100%" />
</p>

- **Zitierende Paper:** Für jedes Paper die 2.000 meistzitierten Arbeiten, die es zitieren, aus ganz OpenAlex. Sortieren Sie nach **meistverknüpft**, um die zu sehen, die auch andere Paper Ihrer Bibliothek zitieren, meist die beste nächste Lektüre.
- **Onlinesuche** in OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe PMC, DataCite und DOAJ auf einmal, zusammengeführt in eine Liste, die markiert, was Sie schon haben. Alles kostenlos.
- Duplikate werden gefunden und zusammengeführt, ohne eine Notiz oder Markierung zu verlieren.

## Paper aus dem Browser speichern

<p align="center">
  <a href="https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf"><img src="../assets/readme/extension.png" alt="Die Paperlines-Erweiterung auf einer Artikelseite, bereit, das Paper samt PDF zu speichern" width="100%" /></a>
</p>

- **Ein Klick vom Artikel aus:** Auf der Seite einer Zeitschrift, bei arXiv, PubMed oder einem DOI-Link zeigt der Paperlines-Button das gefundene Paper (Titel, Autoren, Jahr, Zeitschrift, Kennungen) und speichert es samt PDF.
- **Kennt Ihre Bibliothek:** Er meldet, wenn ein Paper schon vorhanden ist; ein Paper ohne PDF bekommt das PDF statt eines Duplikats.
- **Ihre Abonnements funktionieren:** Das PDF wird mit Ihrer eigenen Browser-Anmeldung geladen.
- **Privat:** Er liest eine Seite nur, wenn Sie klicken, und gibt das Gefundene an Paperlines auf Ihrem Computer weiter, nie an einen Server. Er funktioniert auch bei geschlossener App.
- **Funktioniert in** Google Chrome, Microsoft Edge, Brave, Arc, Vivaldi und Chromium.

**👉 [Paperlines zum Browser hinzufügen](https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf)** und dann in der App unter **Einstellungen → Browsererweiterung** auf **Verbinden** klicken.

## Ihr eigener KI-Assistent

<p align="center">
  <img src="../assets/readme/assistants.png" alt="Einstellungen → KI-Assistenten mit den drei Paperlines-Skills" width="80%" />
</p>

- **Assistenten-Panel (⌘J):** Chatten Sie mit Ihrem eigenen Claude Code oder Codex über das Paper, PDF oder die Notiz, die Sie geöffnet haben. Er darf nur lesen, bis Sie Änderungen erlauben, und jede Änderung, die er vornimmt, wird angezeigt.
- **Verbindung mit einem Klick** für Claude Code, Claude Desktop, Codex, Antigravity, Gemini CLI, Grok und Cursor, über den eingebauten MCP-Server, mit drei Skills: Arbeiten mit Ihren Papern, Schreiben strukturierter Paper-Notizen (jeder Punkt mit seiner Markierung im PDF verknüpft) und Aufspüren von Papern, die Ihnen fehlen.
- Vorschläge landen im Eingang **Vorgeschlagene Paper** eines Projekts. Nichts kommt ohne Ihren Klick in Ihre Bibliothek.

<a id="download"></a>

## Herunterladen

<!-- the release workflow updates these links to each new version -->
| Plattform | Installer | Andere Formate |
| --- | --- | --- |
| **macOS**, Apple Silicon (M1 und neuer) | [Paperlines_0.1.4_aarch64.dmg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.dmg) | [.pkg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.pkg) |
| **macOS**, Intel | [Paperlines_0.1.4_x64.dmg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64.dmg) | [.pkg](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64.pkg) |
| **Windows** 10/11, x64 | [Paperlines_0.1.4_x64-setup.exe](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64-setup.exe) (keine Adminrechte nötig) | [.msi](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_x64_en-US.msi) |
| **Linux**, x86_64 | [Paperlines_0.1.4_amd64.AppImage](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_amd64.AppImage) | [.deb](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_amd64.deb) · [.rpm](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines-0.1.4-1.x86_64.rpm) · [CLI](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/paperlines-x86_64-unknown-linux-gnu) |
| **Linux**, aarch64 | [Paperlines_0.1.4_aarch64.AppImage](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_aarch64.AppImage) | [.deb](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines_0.1.4_arm64.deb) · [.rpm](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/Paperlines-0.1.4-1.aarch64.rpm) · [CLI](https://github.com/Paperlines/paperlines/releases/download/v0.1.4/paperlines-aarch64-unknown-linux-gnu) |
| **NixOS** | `nix profile install github:Paperlines/paperlines` | siehe Hinweise unten |

Alle Dateien finden Sie auf der [Releases-Seite](https://github.com/Paperlines/paperlines/releases/latest). Linux-Pakete brauchen glibc 2.35 oder neuer (Ubuntu 22.04, Debian 12, Fedora 36 und neuer).

**Browsererweiterung (Chrome, Edge, Brave, Arc, Vivaldi):** Speichern Sie das Paper, das Sie gerade lesen, samt PDF mit einem Klick. [Fügen Sie sie aus dem Chrome Web Store hinzu](https://chromewebstore.google.com/detail/paperlines/ooldfogehieegmochobljichkajignkf) und klicken Sie in der App unter **Einstellungen → Browsererweiterung** auf **Verbinden**. Für Browser ohne Store gibt es auch eine [.zip](https://github.com/Paperlines/paperlines/releases/latest/download/paperlines-browser-extension.zip).

### Updates, direkt in der App

<p align="center">
  <img src="../assets/readme/update.png" alt="Der Update-Dialog: was neu ist, wer daran gearbeitet hat, Jetzt aktualisieren oder Später" width="420" />
</p>

Wenn eine neue Version erscheint, sagt Paperlines es Ihnen beim nächsten Start: was neu ist, wer daran gearbeitet hat, und **Jetzt aktualisieren** oder **Später**. Updates sind signiert und werden vor der Installation geprüft. Die macOS-App, die Windows-Installer und das AppImage aktualisieren sich selbst; Installationen per `.deb`, `.rpm` und Nix werden über ihren Paketmanager aktualisiert. Die Prüfung lässt sich unter Einstellungen → Allgemein abschalten; im Offlinemodus wird nie geprüft.

<details>
<summary>Hinweise zu den Plattformen: macOS-Installer, Linux, NixOS, COSMIC/Wayland</summary>

**macOS-Installer.** Öffnen Sie das `.pkg` und folgen Sie den Schritten. Es installiert Paperlines in „Programme“ und den Befehl `paperlines` in `/usr/local/bin`. Zum Deinstallieren löschen Sie die App und `/usr/local/bin/paperlines`; Ihre Bibliothek bleibt, wo sie ist.

**Erster Start unter Windows.** Wenn Windows „Der Computer wurde durch Windows geschützt“ anzeigt, klicken Sie auf **Weitere Informationen → Trotzdem ausführen**. Signierte Windows-Builds sind in Vorbereitung ([Richtlinie zur Code-Signierung](../code-signing.md)).

**Linux.** Die `.deb`- und `.rpm`-Pakete installieren die CLI als `paperlines`. Für das AppImage legen Sie die separate Datei `paperlines-<triple>` in Ihren PATH, oder nutzen Sie **Einstellungen → Kommandozeile → Kommandozeilentool installieren**.

**NixOS.** Das Repository ist ein Flake, das die App und die CLI aus dem Quellcode baut (x86_64 und aarch64):

```sh
nix run github:Paperlines/paperlines            # try it
nix profile install github:Paperlines/paperlines
```

In einer NixOS- oder home-manager-Konfiguration fügen Sie das Flake als Input hinzu und nutzen sein Overlay:

```nix
nixpkgs.overlays = [ inputs.paperlines.overlays.default ];
environment.systemPackages = [ pkgs.paperlines ];   # or home.packages
```

Damit werden die App mit Desktop-Eintrag und Symbol sowie der Befehl `paperlines` installiert. Hinweise:
- API-Schlüssel gehen an den Secret Service. Aktivieren Sie einen (`services.gnome.gnome-keyring.enable = true;` oder KeePassXC); ohne ihn werden sie stattdessen in einer verschlüsselten Datei gespeichert.
- Das AppImage läuft unter NixOS nicht ohne Weiteres; nutzen Sie das Flake (oder `appimage-run`).

**COSMIC (und andere Wayland-Desktops).** Für COSMIC gebaut, aber dort noch nicht getestet, Rückmeldungen sind also willkommen:
- Hell/Dunkel folgt der Desktop-Einstellung (gelesen über das XDG-Desktop-Portal, das COSMIC, GNOME und KDE nutzen), auch beim Umschalten, während die App offen ist. Das meint das Design **System** in den Einstellungen.
- Das Fenster hat eine richtige App-ID, sodass das Dock das richtige Symbol zeigt und das Fenster seinem Starter zuordnet.
- Mit dem NVIDIA-Treiber unter Wayland wird der DMA-BUF-Renderer von WebKitGTK automatisch abgeschaltet (er zeigt dort ein leeres Fenster). Setzen Sie `WEBKIT_DISABLE_DMABUF_RENDERER=0`, um ihn eingeschaltet zu lassen.
- Dateidialoge kommen von GTK. Das Fenster hat keine System-Titelleiste und keine Menüleiste: Die eigene obere Leiste von Paperlines enthält die Fensterknöpfe, und durch Ziehen an ihr verschieben Sie das Fenster.

</details>

<a id="command-line-and-ai-assistants"></a>

## Kommandozeile und KI-Assistenten

Der Befehl `paperlines` arbeitet mit derselben Bibliothek wie die App. Das macOS-`.pkg` installiert ihn; anderswo nutzen Sie **Einstellungen → Kommandozeile → Kommandozeilentool installieren**.

<details>
<summary>Befehle</summary>

Das macOS-`.pkg` installiert ihn für Sie. Andernfalls nutzen Sie **Einstellungen → Kommandozeile → Kommandozeilentool installieren**. Unter macOS verlinkt das die in der App enthaltene CLI nach `~/.local/bin/paperlines`. Dann:

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

Jeder Befehl akzeptiert `--json`. `--library DIR` oder `PAPERLINES_LIBRARY=DIR` wählt eine andere Bibliothek. CLI, App und MCP-Server teilen sich eine Implementierung (`crates/ops`), daher sind ihre Ergebnisse identisch.

</details>

<details>
<summary>MCP-Server für Claude Code, Claude Desktop und andere</summary>

```sh
claude mcp add paperlines -- paperlines mcp
```

Claude Desktop: Fügen Sie dies zu `claude_desktop_config.json` hinzu:

```json
{ "mcpServers": { "paperlines": { "command": "paperlines", "args": ["mcp"] } } }
```

Werkzeuge: `search_library`, `get_item`, `get_paper_note`, `list_citations`, `find_citing_papers`, `list_relations`, `export_bibliography` (alle nur lesend; `find_citing_papers` nutzt das Netzwerk, sofern die Antwort nicht zwischengespeichert ist), `add_bullet` (hängt einen Punkt an eine Paper-Notiz an) und `add_relation` (erfasst eine typisierte Verbindung, um die der Nutzer gebeten hat). Der Server kommuniziert nur über stdin und stdout.

</details>

<a id="questions-people-ask"></a>

## Häufige Fragen

<details>
<summary>Brauche ich ein Konto? Geht etwas in die Cloud?</summary>

Kein Konto, keine Cloud, keine Telemetrie. Die Bibliothek ist ein Ordner auf Ihrem Computer. Die einzigen Netzwerkzugriffe sind Abfragen von Metadaten, Referenzen und zitierenden Papern (Crossref, OpenAlex, Semantic Scholar, arXiv), wenn Sie Paper hinzufügen oder danach fragen, wobei Bezeichner wie eine DOI gesendet werden, sowie eine Anfrage an GitHub beim Start der App, um zu sehen, ob es eine neue Version gibt. **Einstellungen → Offlinemodus** schaltet all das ab.

</details>

<details>
<summary>Kann ich von Zotero umsteigen?</summary>

Ja. **Hinzufügen → Aus Zotero importieren** übernimmt Paper mit ihren PDFs, Sammlungen (als Projekte), Tags, Notizen und Markierungen. Die Zotero-Datenbank wird zuerst kopiert und nie verändert, Sie können also beide weiter nutzen.

</details>

<details>
<summary>Wo liegen meine Daten, und wie sichere ich sie?</summary>

| | macOS | Linux |
| --- | --- | --- |
| Bibliothek (Datenbank, `pdfs/`, `backups/`; verschiebbar unter **Einstellungen → Bibliothek**) | `~/Library/Application Support/Paperlines/` | `$XDG_DATA_HOME/paperlines/` (Standard `~/.local/share/paperlines/`) |
| Konfiguration (Ersatzspeicher für API-Schlüssel) | `~/Library/Application Support/Paperlines/` | `$XDG_CONFIG_HOME/paperlines/` |
| Cache | `~/Library/Caches/Paperlines/` | `$XDG_CACHE_HOME/paperlines/` |

- **Die Bibliothek** ist eine SQLite-Datei (WAL, FTS5) plus PDFs, gespeichert nach Inhalts-Hash. Originaldateien werden hineinkopiert, nie verändert.
- **Cloud-Ordner.** Wenn Sie die Bibliothek in iCloud Drive oder Dropbox ablegen, beenden Sie die App vor dem Synchronisieren. Ein Cloud-Client darf keine geöffnete SQLite-Datenbank synchronisieren.
- **API-Schlüssel.** Schlüssel (Semantic Scholar und OpenAlex, beide optional) kommen in den macOS-Schlüsselbund oder den Linux Secret Service. Ohne Secret Service landen sie in einer verschlüsselten Datei im Konfigurationsordner.

Jeden Tag und vor jedem Upgrade wird ein Backup erstellt; **Einstellungen → Bibliothek** stellt eines mit einem Klick wieder her, und `paperlines backup` tut dasselbe im Terminal.

</details>

<details>
<summary>Funktioniert es mit LaTeX?</summary>

Ja. Kopieren Sie Zitate in rund 80 Stilen, exportieren Sie BibTeX, CSL-JSON oder RIS, und nutzen Sie **Diese Datei aktuell halten**, um eine `.bib`-Datei bei jeder Änderung der Bibliothek neu zu schreiben, wie bei Better BibTeX.

</details>

<details>
<summary>Alles, was Paperlines kann</summary>

- **Bibliothek.** Fügen Sie Paper hinzu, indem Sie PDFs, EPUBs oder Ordner hineinziehen, oder aus DOIs, arXiv-IDs und BibTeX-, RIS- oder CSL-JSON-Dateien. Wie in Zotero wird jede Datei nach Titel und Autor aufgeführt, nicht nach Dateiname. Metadaten stammen aus der Datei (PDF-Infos, EPUB-Paketdaten) und werden über Crossref oder OpenAlex ergänzt. Ein PDF ohne DOI wird anhand des Textes der ersten Seite zugeordnet. Sie prüfen alles, bevor es gespeichert wird. Die Bibliothek ist eine sortierbare Tabelle (Titel, Urheber, Jahr, Hinzufügedatum), und alle bibliografischen Felder sind bearbeitbar: Band, Heft, Seiten, Verlag, Ort, ISBN/ISSN, Auflage, Reihe und Herausgeber.
- **Import aus Zotero.** Übernimmt Paper mit ihren PDFs, Sammlungen (als Projekte), Tags, Notizen und Markierungen. Die Zotero-Datenbank wird zuerst kopiert und nie verändert. Ein JSON-Dump aus dieser App lässt sich ebenfalls importieren.
- **Duplikate und Papierkorb.** Eine Duplikat-Ansicht findet Paper mit demselben PDF oder nahezu gleichem Titel im selben Jahr. Führen Sie sie zu einem zusammen, wobei jede Notiz, Markierung, jeder Tag und jede Datei erhalten bleibt. Löschen verschiebt Paper in den Papierkorb (mit Rückgängig); er leert sich nach 30 Tagen selbst (einstellbar).
- **Suche.** Die Volltextsuche umfasst Titel, Autoren, Abstracts, Notizen und Markierungen, mit Qualifikatoren: `tag:ml/nlp project:"Thesis" author:hinton year:>=2020 is:unread has:pdf cites:<citekey> cited-by:<citekey>`, und `-` schließt einen Begriff aus. Suchen lassen sich speichern.
- **Organisieren.** Farbige, hierarchische Tags (umbenennen und zusammenführen), Projekte, Lesestatus, Bewertungen und eine Befehlspalette (⌘K / Ctrl+K).
- **Lesen.** Ein PDF.js-Reader mit Markierungen, Unterstreichungen und Bereichsauswahlen. Markierungsfarben tragen Bedeutungen (gelb = Kernidee usw.). „In Notiz zitieren“ kopiert eine Markierung in die Paper-Notiz, mit einem Link zurück zur Seite. „Annotiertes PDF exportieren“ schreibt eine Kopie; das Original wird nie verändert.
- **Schnell hinzufügen.** Fügen Sie eine DOI, arXiv- oder PubMed-ID oder einen Titel in das Feld in der oberen Leiste ein und drücken Sie Enter, um es zu prüfen und hinzuzufügen; die Schaltfläche am Ende bietet die anderen Wege (Dateien, Ordner, BibTeX, Zotero, ein Bibliotheksexport, Onlinesuche).
- **Paper-Notizen.** Jedes Paper hat eine Notiz. Ihr Kopf (Titel, Autoren, Daten) wird aus dem Paper erzeugt; der Inhalt sind Ihre Punkte. Notizen sind Markdown mit `[[links]]` zu anderen Notizen und Papern (die Eingabe von `[[` schlägt sie vor und bietet eine neue Notiz an, wenn nichts passt; das Folgen des Links erstellt die Notiz), `@citekey`, Formeln und Backlinks. Formeln sind LaTeX: `$…$` im Text und `$$…$$` für eine zentrierte Formel, auch über mehrere Zeilen, gerendert mit KaTeX. In Formeln vervollständigt die Eingabe von `\` Befehle samt Symbol (`\al` → `\alpha` α), und die Werkzeugleiste des Editors bietet Titel und Überschriften, Fett, Kursiv, Durchgestrichen und Code, Aufzählungen, nummerierte Listen, Checklisten und Zitate (mit Kürzeln: ⌘B, ⌘I, ⌘E, ⌘⇧X, ⌘⇧8/7/9, ⌘⌥1–3; jede Schaltfläche schaltet um, und Enter setzt eine Liste fort), eine Link-Schaltfläche, Schaltflächen für Formeln im Text und Formelblöcke sowie eine **Ω**-Palette mit griechischen Buchstaben, Operatoren, Relationen, Pfeilen, Mengen- und Logiksymbolen und Akzenten. Live-Vorschau: Markdown und Formeln werden beim Tippen gerendert, außer dort, wo Sie gerade bearbeiten. Freie Notizen und Projektnotizen funktionieren genauso.
- **Onlinesuche.** Eine Suche über OpenAlex, Semantic Scholar, arXiv, PubMed, Crossref, Europe PMC (Lebenswissenschaften, mit freiem Volltext), DataCite (Datensätze, Software und Preprints) und DOAJ (Open-Access-Zeitschriften), zusammengeführt in eine gerankte Liste; schalten Sie Quellen ein und aus, sehen Sie, welche Paper Sie schon haben, und kartieren Sie die Ergebnisse als Projektgraphen. Alles kostenlos; nur OpenAlex und Semantic Scholar nehmen einen optionalen Schlüssel.
- **Zitationsgraph.** Literaturlisten werden einmal abgerufen (OpenAlex, dann Semantic Scholar, oder Ihr eigener GROBID-Server) und zwischengespeichert; OpenCitations, ein offener Zitationsindex, ergänzt fehlende Referenzen und springt ein, wenn keiner der beiden ein Paper kennt. Nur Paper aus Ihrer Bibliothek erscheinen im Graphen. Später hinzugefügte Paper werden offline aus dem Cache verknüpft. Sie können Verknüpfungen von Hand hinzufügen oder entfernen, und eine Neuberechnung behält diese Entscheidungen bei.
- **Graphansicht.** Paper sind abgerundete Kästen, beschriftet mit Erstautor und Jahr („Smith ’21“), oder als Punkte. Ein lebendiges Kräfte-Layout: Paper schweben und kommen zur Ruhe, das Ziehen eines Papers zieht seine Nachbarn mit, Beschriftungen blenden beim Zoomen ein, und beim Darüberfahren leuchten die Zitationen eines Papers auf (blau: es zitiert, orange: zitiert es), während der Rest abgedunkelt wird. Paper sind mit ihrer Projektfarbe gefüllt und nach Lesestatus umrandet; Auswahl und Tastaturfokus zeichnen eine Kontur um den Kasten, und eine kleine Legende auf der Fläche erklärt die Farben. Das Zahnrad dockt die Graph-Einstellungen neben dem Graphen an (und verbreitert ihn zuerst, wenn der Bereich schmal ist): **Filter** (Suche, unverknüpfte Paper, Jahre, Tag, Projekt, Status, lokaler Graph um das ausgewählte Paper), **Gruppen** (Farbe nach Projekt, Tag oder Status; Statusring; Legende), **Anzeige** (Kästen oder Punkte, Kräfte- oder Jahres-Layout, Beschriftungen, Pfeile, Textausblendung, Knotengröße, Linienstärke, Übersichtskarte) und **Kräfte** (Zentrierung, Abstoßung, Verbindungskraft, Linienlänge). Beim Darüberfahren zeigt ein Paper seine Notizkarte; Klick heftet sie an und macht sie bearbeitbar; Doppelklick oder Enter öffnet das PDF.
- **Typisierte Verbindungen.** Halten Sie nach Ihrem Urteil fest, wie Paper zueinander stehen: Eines *erweitert* ein anderes, *widerspricht* ihm, *repliziert* es oder *wendet seine Methode an*, oder ein Typ, den Sie selbst festlegen (z. B. *stützt* / *gestützt von*). Jede Verbindung liest sich von beiden Papern aus richtig („Erweitert“ / „Erweitert von“), kann eine Notiz und eine PDF-Markierung als Beleg tragen und erscheint im Graphen als farbige, beschriftete Linie, die sich nach Typ filtern lässt. Fügen Sie sie über den Tab „Zitationen“ eines Papers, das Kontextmenü, ⌘K oder im Graphen hinzu, indem Sie mit ⌥ von einem Paper auf ein anderes ziehen. Außerdem `paperlines relate chen2022 extends smith2021` und die MCP-Werkzeuge `list_relations` / `add_relation`.
- **Zitierende Paper.** Für jedes Paper mit DOI oder arXiv-ID sehen Sie, wer es zitiert, aus ganz OpenAlex (Semantic Scholar als Ausweichquelle): die 2.000 meistzitierten, sortierbar nach Zitationen, Datum oder **meistverknüpft**, also den Papern, die auch andere Paper Ihrer Bibliothek zitieren, meist die beste nächste Lektüre. Filtern Sie, sehen Sie, welche schon in Ihrer Bibliothek sind, und fügen Sie die gewünschten über die Importprüfung hinzu. Eine Woche lang gespeichert; `paperlines citing` und der MCP-Server tun dasselbe.
- **Schlüsselpaper (Rückgrat).** Markieren Sie Schritt für Schritt die Paper, auf denen ein Projekt ruht: die Idee, dann was darauf aufbaute. Ein Schritt kann mehrere Paper enthalten (zwei Gruppen, die gleichzeitig dasselbe fanden). Bauen Sie es im Projektdialog auf oder per Rechtsklick auf ein Paper → *Zum Rückgrat hinzufügen*. Der Graph zeichnet Schlüsselpaper als bernsteinfarbene Kästen, nach Schritt nummeriert (①, ②…), verbunden durch einen goldenen Pfad. Zwei weitere Layouts nutzen es: **Baum** wächst von links nach rechts aus dem Rückgrat, jeder Schritt ein benannter Kasten am Stamm und jedes andere Paper hängt an dem Schlüsselpaper, dem es am nächsten ist; **Kreis** setzt alle Paper auf einen Ring, gruppiert nach Projekt und nach Jahr geordnet (Punkte ab 150 Papern). Außerdem `paperlines spine "Thesis" add smith2018 --step 1`.
- **Assistenten-Panel.** ⌘J (oder die Assistenten-Schaltfläche) öffnet einen Chat mit Ihrem eigenen **Claude Code** oder **Codex**, angemeldet mit Ihrem eigenen Konto, sodass kein API-Schlüssel einzurichten ist. Das Panel bietet die Agenten an, die Sie unter Einstellungen ▸ KI-Assistenten verbunden haben; wechseln Sie in seiner Kopfzeile zwischen ihnen (ein Wechsel startet einen neuen Chat). Er sieht nur Ihre Paperlines-Bibliothek, über dieselben Werkzeuge wie der MCP-Server. Er weiß, welches Paper, PDF oder welche Notiz Sie geöffnet haben, und schlägt passende Fragen vor. Seine Schritte falten sich zu einer Zeile, die Sie aufklappen können, und `@citekey`- und Markierungslinks in seinen Antworten öffnen das Paper oder die Seite. Er ist auf **Nur lesen** gestellt, bis Sie ihn auf **Darf ändern** umschalten; dann kann er Notizen, Markierungen, Verbindungen und Vorschläge schreiben (er löscht nie), und jede Änderung wird im Chat angezeigt.
- **Darstellung.** Einstellungen ▸ Darstellung: Design, Akzentfarbe (Petrol, Blau, Violett, Grün, Bernstein, Rosé), Layout (Seitenleiste und Assistent auf beliebiger Seite: Klassisch, Gespiegelt, beide links, beide rechts), dünne oder normale Symbole und optionale Beschriftungen unter den Symbolen der oberen Leiste.
- **KI-Assistenten.** Einstellungen → KI-Assistenten verbindet den eingebauten MCP-Server mit einem Klick mit Claude Code, Claude Desktop, Codex, Antigravity, Gemini CLI, Grok und Cursor (es bearbeitet die Konfiguration des jeweiligen Assistenten oder nutzt dessen eigenen Befehl `mcp add` und lässt alles andere unverändert) und installiert drei Skills: **paperlines** (Arbeiten mit Ihren Papern), **paperlines-notes** (Paper-Notizen in Ihrem Format Kernidee / Methode / Warum es zählt schreiben, oder Argument für Argument: Er markiert den Satz hinter jedem Argument im PDF in der Farbe für dessen Bedeutung und verknüpft jeden Punkt der Notiz mit seiner Markierung; außerdem Projektsynthesen und Related-Work-Entwürfe; er zeigt den Text und fragt vor dem Speichern, und überschreibt nie) und **paperlines-scout** (Paper finden, die Ihnen fehlen). Der Assistent sieht Ihre Projekte und worum es in Ihrer Bibliothek geht, liest das PDF eines Papers, markiert Passagen, indem er sie zitiert (der Reader setzt sie auf die Seite, wenn das PDF das nächste Mal geöffnet ist), und kann Notizen erstellen oder ergänzen. Die App übernimmt seine Änderungen, sobald ihr Fenster wieder in den Vordergrund kommt. Fragen Sie ihn, was Sie als Nächstes lesen sollen: Er schlägt Paper mit Begründung vor (von mehreren Ihrer Projektpaper zitiert, mehrere davon zitierend, verwandt oder zu einem Thema passend) und legt sie in den Eingang **Vorgeschlagene Paper** des Projekts, wo Sie jedes einzeln hinzufügen oder verwerfen; nichts kommt ohne Ihren Klick in Ihre Bibliothek, und verworfene Paper kommen nie wieder. Außerdem `paperlines suggest --project NAME [--topic …] [--post]` und `paperlines projects`.
- **Tabs und Layouts.** PDFs, Notizen und der Graph öffnen sich als Tabs. Drei Layouts: nur Bibliothek, Bibliothek mit Reader und nur Reader.
- **Zitieren.** Kopieren Sie ein Zitat (⌘⇧C) oder eine Literaturangabe (⌘⇧B) in einem von rund 80 eingebauten CSL-Stilen (APA, Chicago, IEEE, Nature, Vancouver…). Es wird in Word oder Google Docs als formatierter Text eingefügt. **Open-Access-PDF suchen** holt über OpenAlex eine legale Kopie.
- **Export.** BibTeX, CSL-JSON, RIS, eine Markdown-Literaturliste, ein formatiertes Literaturverzeichnis (HTML, in jedem Stil) und ein Ordner mit Markdown-Notizen. **Ganze Bibliothek** schreibt einen Ordner, `library.json` plus `pdfs/`, mit allem: Paper und ihre PDFs, Notizen, Markierungen, Tags, Projekte mit ihren Farben und Schlüsselpapern, der Zitationsgraph (einschließlich von Hand gesetzter Verknüpfungen) und typisierte Verbindungen mit ihren Belegen. **Hinzufügen ▸ Bibliothek importieren…** holt ihn in eine andere Bibliothek (auf einem anderen Computer oder zusammengeführt mit einer bestehenden: bereits vorhandene Paper werden übersprungen). Außerdem `paperlines export-library DIR` und `paperlines import-dump FOLDER`. **Diese Datei aktuell halten** schreibt eine `.bib`-Datei (oder andere) bei jeder Änderung der Bibliothek neu, wie Better BibTeX, damit LaTeX-Projekte aktuell bleiben.
- **Hilfe, wo Sie sie brauchen.** Die ⓘ-Schaltflächen in den Einstellungen und neben Suche, Papierkorb und Duplikaten erklären jede Option.
- **Sicherheit.** Ein tägliches Backup mit Wiederherstellung per Klick, ein Backup vor jedem Schema-Upgrade, Transaktionen überall und `doctor`.
- **Kommandozeile und MCP.** Die CLI `paperlines` und ein MCP-Server, damit Claude Code oder Claude Desktop Ihre Bibliothek durchsuchen und Punkte zu Paper-Notizen hinzufügen können. Er läuft lokal über stdio, nie über das Netzwerk.

Der einzige Netzwerkzugriff sind Abfragen von Metadaten, Referenzen und zitierenden Papern (Crossref, OpenAlex, Semantic Scholar, arXiv), und zwar nur, wenn Sie Paper hinzufügen oder danach fragen, plus eine Anfrage an GitHub beim Start der App, um zu sehen, ob eine neue Version erschienen ist (abschaltbar unter Einstellungen → Allgemein). Es werden nur Bezeichner (DOI, arXiv-ID) gesendet. Ein kostenloser OpenAlex-API-Schlüssel (Einstellungen → Zitationen) gibt Ihnen ein eigenes Tageskontingent; ohne ihn teilen sich Abfragen ein kleines Kontingent mit Ihrem Netzwerk. **Einstellungen → Offlinemodus** schaltet all das ab.

</details>

## Aus dem Quellcode bauen

Voraussetzungen:

- Node 26+, pnpm 12.21 (genaue Version in `package.json`), Rust über rustup (Version festgelegt in `rust-toolchain.toml`)
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

Für einen universellen macOS-Build führen Sie `rustup target add x86_64-apple-darwin aarch64-apple-darwin` aus, dann `pnpm tauri build --target universal-apple-darwin`.

Prüfungen, Architektur und Konventionen stehen in [docs/development.md](../development.md) und [docs/architecture.md](../architecture.md).

## Mehr erfahren

- [Neuigkeiten](../CHANGELOG.md): die Änderungen jeder Version
- [Entwicklung](../development.md): Prüfungen, Releases, Signieren, Nix, Windows, Umbenennen
- [Architektur](../architecture.md): wie der Code aufgebaut ist und warum
- [Mitmachen](../../.github/CONTRIBUTING.md): wie Sie helfen können

## Community

Fehlermeldungen, Ideen und Pull Requests sind willkommen: [Issue eröffnen](https://github.com/Paperlines/paperlines/issues) oder [CONTRIBUTING.md](../../.github/CONTRIBUTING.md) lesen, um loszulegen. Danke an alle, die beigetragen haben:

<a href="https://github.com/Paperlines/paperlines/graphs/contributors"><img src="https://contrib.rocks/image?repo=Paperlines/paperlines" alt="Mitwirkende" /></a>

Wenn Paperlines Ihrer Forschung hilft, hilft ein ⭐ auf GitHub anderen Forschenden, es zu finden.

## Paperlines zitieren

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

**Hilfe & Info → Paperlines zitieren** in der App liefert den Eintrag mit Ihrer genauen Version, auch im APA-Stil.

</details>

## Lizenz

Copyright © 2026 die Paperlines-Mitwirkenden und Yoav Yosif-Or. Paperlines ist freie Software unter der [GNU Affero General Public License v3.0 oder neuer](../../LICENSE): Sie dürfen sie nutzen, untersuchen, weitergeben und verändern, und wenn Sie eine veränderte Version verbreiten (auch als Netzwerkdienst), müssen Sie Ihre Änderungen unter derselben Lizenz teilen.

<sub>Claude, Codex, Gemini, Antigravity, Grok und Cursor sind Marken ihrer jeweiligen Inhaber. Ihre Namen und Symbole erscheinen nur, um zu zeigen, mit welchen Werkzeugen Paperlines zusammenarbeitet, und bedeuten keine Billigung. Die Assistenten-Symbole stammen von [Lobe Icons](https://github.com/lobehub/lobe-icons) (MIT-Lizenz, siehe `src/assets/agents/LICENSE-lobe-icons.txt`).</sub>

---

<p align="center">
  Erstellt von <a href="https://github.com/yoav-yosifor"><strong>Yoav Yosif-Or</strong></a>
</p>
