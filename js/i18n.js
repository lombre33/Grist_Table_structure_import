/**
 * Minimal fr/en dictionary + DOM binding for this widget's static chrome
 * strings (labels, headings, buttons, hints) — see the Grist Factory UI/UX
 * identity's "Bilingue fr/en systématique" rule.
 *
 * Scope: this covers every *static* string in index.html (present in the
 * markup before any JS runs). The dynamic, parameterized status/warning
 * messages built at runtime in js/importTab.js and js/exportTab.js (e.g.
 * "Table « X » créée avec 3 colonnes.") are intentionally NOT covered yet —
 * see README.md's "Bilingue" section for why this was scoped out of this
 * pass rather than half-translated.
 *
 * No innerHTML anywhere (see SECURITY.md): the one string that embeds an
 * inline <code> element (export.formulaHint) is rebuilt from a "{code}"
 * placeholder using safe DOM construction (js/dom.js), never HTML parsing.
 */

import { el, clear } from "./dom.js";

const STRINGS = {
  fr: {
    "settings.open": "Réglages",
    "settings.close": "Fermer",
    "settings.title": "Réglages",
    "settings.appearance": "Apparence",
    "settings.theme.system": "Système",
    "settings.theme.light": "Clair",
    "settings.theme.dark": "Sombre",
    "settings.language": "Langue",
    "settings.credits": "Crédits",
    "settings.credits.author": "Auteur",
    "settings.credits.site": "Site",
    "settings.credits.license": "Licence",
    "app.documentTitle": "Structure de table Grist",
    "app.eyebrow": "Widget Grist",
    "app.title": "Structure de table",
    "app.lede": "Importez la structure d'une table depuis un autre document, ou exportez celle d'une table de ce document.",
    "tabs.import": "Import",
    "tabs.export": "Export",
    "import.step1.eyebrow": "1. Code source",
    "import.step1.label": "Code Python d'une table (menu de la table « Code View », dans le document d'origine)",
    "import.step1.placeholder": "@grist.UserTable\nclass MaTable:\n  MaColonne = grist.Text()",
    "import.analyze": "Analyser",
    "import.step2.eyebrow": "2. Que faire de ce code ?",
    "import.mode.create.title": "Nouvelle table",
    "import.mode.create.desc": "Crée une table dédiée avec toutes les colonnes détectées. Recommandé.",
    "import.mode.existing.title": "Table existante",
    "import.mode.existing.desc": "Ajoute uniquement les colonnes qui manquent à une table déjà présente ici.",
    "import.step3.eyebrow": "3. Vérification avant application",
    "import.tablePicker.label": "Table à importer (plusieurs trouvées)",
    "import.tableMultiPicker.label": "Tables à créer (plusieurs trouvées)",
    "import.tableId.label": "Identifiant(s) de la nouvelle table",
    "import.targetTable.label": "Table à compléter",
    "import.preview.column": "Colonne",
    "import.preview.type": "Type Grist",
    "import.preview.status": "Statut",
    "import.warnings.eyebrow": "Remarques",
    "import.action.create": "Créer la table dans ce document",
    "export.step1.eyebrow": "1. Tables à exporter",
    "export.tables.empty": "Aucune table exportable trouvée dans ce document.",
    "export.refs.include": "Inclure ces tables",
    "export.refs.dismiss": "Continuer sans elles",
    "export.refresh": "Actualiser la liste",
    "export.generate": "Générer le code",
    "export.step2.eyebrow": "2. Code généré",
    "export.copy": "Copier",
    "export.formulaHint":
      "Seule la structure (types de colonnes) est garantie fidèle. Pour une colonne de formule, " +
      "la formule d'origine est recopiée telle que stockée (syntaxe {code} de Grist) quand elle " +
      "existe, sinon remplacée par la valeur par défaut du type — comme le fait Grist lui-même " +
      "pour une formule vide.",
  },
  en: {
    "settings.open": "Settings",
    "settings.close": "Close",
    "settings.title": "Settings",
    "settings.appearance": "Appearance",
    "settings.theme.system": "System",
    "settings.theme.light": "Light",
    "settings.theme.dark": "Dark",
    "settings.language": "Language",
    "settings.credits": "Credits",
    "settings.credits.author": "Author",
    "settings.credits.site": "Site",
    "settings.credits.license": "License",
    "app.documentTitle": "Grist table structure",
    "app.eyebrow": "Grist widget",
    "app.title": "Table structure",
    "app.lede": "Import a table's structure from another document, or export one from a table in this document.",
    "tabs.import": "Import",
    "tabs.export": "Export",
    "import.step1.eyebrow": "1. Source code",
    "import.step1.label": "A table's Python code (from the table's “Code View” menu, in the source document)",
    "import.step1.placeholder": "@grist.UserTable\nclass MyTable:\n  MyColumn = grist.Text()",
    "import.analyze": "Analyze",
    "import.step2.eyebrow": "2. What should happen to this code?",
    "import.mode.create.title": "New table",
    "import.mode.create.desc": "Creates a dedicated table with every detected column. Recommended.",
    "import.mode.existing.title": "Existing table",
    "import.mode.existing.desc": "Only adds the columns missing from a table already present here.",
    "import.step3.eyebrow": "3. Review before applying",
    "import.tablePicker.label": "Table to import (several found)",
    "import.tableMultiPicker.label": "Tables to create (several found)",
    "import.tableId.label": "New table's identifier(s)",
    "import.targetTable.label": "Table to complete",
    "import.preview.column": "Column",
    "import.preview.type": "Grist type",
    "import.preview.status": "Status",
    "import.warnings.eyebrow": "Notes",
    "import.action.create": "Create the table in this document",
    "export.step1.eyebrow": "1. Tables to export",
    "export.tables.empty": "No exportable table found in this document.",
    "export.refs.include": "Include these tables",
    "export.refs.dismiss": "Continue without them",
    "export.refresh": "Refresh the list",
    "export.generate": "Generate code",
    "export.step2.eyebrow": "2. Generated code",
    "export.copy": "Copy",
    "export.formulaHint":
      "Only the structure (column types) is guaranteed faithful. For a formula column, the " +
      "original formula is copied back exactly as stored (Grist's {code} syntax) when it exists, " +
      "otherwise replaced with the type's default value — just as Grist itself does for an empty " +
      "formula.",
  },
};

const STORAGE_KEY = "gristFactory.locale";
let currentLocale = "fr";

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return STRINGS[value] ? value : null;
  } catch {
    return null;
  }
}

function writeStored(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Best effort only — same iframed-storage caveat as js/theme.js.
  }
}

export function t(key) {
  return (STRINGS[currentLocale] && STRINGS[currentLocale][key]) || STRINGS.fr[key] || key;
}

export function getLocale() {
  return currentLocale;
}

function applyToNode(node) {
  const key = node.getAttribute("data-i18n");
  const text = t(key);
  const codeText = node.getAttribute("data-i18n-code");
  if (codeText && text.includes("{code}")) {
    const [before, after] = text.split("{code}");
    clear(node);
    if (before) node.appendChild(document.createTextNode(before));
    node.appendChild(el("code", { text: codeText }));
    if (after) node.appendChild(document.createTextNode(after));
  } else {
    node.textContent = text;
  }
}

export function applyI18n() {
  document.documentElement.lang = currentLocale;
  document.title = t("app.documentTitle");
  for (const node of document.querySelectorAll("[data-i18n]")) applyToNode(node);
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.placeholder = t(node.getAttribute("data-i18n-placeholder"));
  }
  for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
    node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria-label")));
  }
}

export function initLocale() {
  currentLocale = readStored() || "fr";
  applyI18n();
  return currentLocale;
}

export function setLocale(value) {
  currentLocale = STRINGS[value] ? value : "fr";
  writeStored(currentLocale);
  applyI18n();
}
