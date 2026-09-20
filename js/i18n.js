/**
 * fr/en dictionary + DOM binding for this widget's interface — see the
 * Grist Factory UI/UX identity's "Bilingue fr/en systématique" rule.
 *
 * Two kinds of entries:
 * - Static chrome strings (labels, headings, buttons, hints), bound via
 *   data-i18n/-placeholder/-aria-label attributes in index.html and applied
 *   by applyI18n() below — t(key) with no params.
 * - Dynamic status/warning messages built at runtime in js/importTab.js,
 *   js/exportTab.js, js/gristTypes.js and js/parser.js (e.g.
 *   "Table « X » créée avec 3 colonnes.") — t(key, params) for a plain
 *   parameterized string, tn(key, count, params) for one that also needs
 *   singular/plural agreement (a {one, other} dictionary entry instead of a
 *   plain string).
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
    "import.step1.label":
      "Code Python d'une table (menu « Code View » du document d'origine, ou onglet Export de ce widget pour les choix détaillés)",
    "import.step1.placeholder": "@grist.UserTable\nclass MaTable:\n  MaColonne = grist.Text()",
    "import.analyze": "Analyser",
    "import.clear": "Effacer",
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
    "import.preview.include": "Inclure",
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

    // --- Dynamic status/warning messages (js/importTab.js, js/exportTab.js,
    // js/gristTypes.js, js/parser.js) — see t()/tn() in this module. A
    // {one, other} value is a pluralized entry, read via tn(key, count, ...).
    "error.noGristApi":
      "Impossible de trouver l'API Grist. Ouvrez cette page en tant que widget personnalisé " +
      "dans un document Grist (elle ne fonctionne pas seule, hors d'un document).",
    "error.timeout": "Délai dépassé en attendant la réponse du document Grist.",
    "common.tablesCount": { one: "{n} table", other: "{n} tables" },
    "common.columnsCount": { one: "{n} colonne", other: "{n} colonnes" },

    "warn.invalidWidgetOptions": "Colonne « {columnId} » : widget_options n'est pas un JSON valide, ignoré.",
    "warn.dateTimeNoTimezone":
      "Colonne « {columnId} » : fuseau horaire non précisé pour DateTime, « {timezone} » utilisé par défaut (à vérifier).",
    "warn.refTargetMissingSyntax": "Colonne « {columnId} » : table cible introuvable pour {dslType}, importée en tant que « Any ».",
    "warn.unknownType": "Colonne « {columnId} » : type « {dslType} » non reconnu, importée en tant que « Any ».",

    "warn.decoratorNoClass":
      'Ligne {line} : "@grist.UserTable" n\'est pas suivi d\'une classe valide ("class NomTable:"), ignoré.',
    "warn.noTableFound": 'Aucune table trouvée : le texte doit contenir un bloc "@grist.UserTable" suivi de "class NomTable:".',
    "warn.formulaTypeNoFunction": "Ligne {line} : décorateur formulaType non suivi d'une fonction, ignoré.",
    "warn.formulaTypeDuplicate": "Ligne {line} : décorateur formulaType en double, le précédent est ignoré.",
    "warn.unknownDecorator": "Ligne {line} : décorateur non reconnu ignoré ({snippet}).",
    "warn.unrecognizedContent": "Ligne {line} : contenu non reconnu ignoré ({snippet}).",
    "warn.reservedColumnId": "Ligne {line} : colonne « {id} » ignorée (identifiant réservé, déjà géré par Grist).",
    "warn.duplicateColumnId": "Ligne {line} : colonne « {id} » en double, Grist ajoutera un suffixe automatiquement.",
    "warn.tablePrefix": "Table « {tableId} » — {message}",

    "import.error.fetchDocInfo": "Impossible de récupérer les informations de ce document : {error}.",
    "import.error.fetchExistingTables": "Impossible de lire les tables existantes de ce document : {error}.",
    "warn.refTargetMissingInDoc":
      "Colonne « {colId} » : la table cible « {target} » n'existe pas dans ce document, importée en tant que « Any » " +
      "(vous pourrez la reconfigurer en Référence une fois la table cible créée).",
    "warn.visibleColMissing":
      "Colonne « {colId} » : colonne d'affichage « {visibleColId} » introuvable dans la table « {target} » de ce " +
      "document, ignorée (visible_col).",
    "import.status.analyzing": "Analyse du document en cours…",
    "import.error.noTableList": "Impossible de charger la liste des tables de ce document.",
    "import.error.noTablesToComplete": "Ce document ne contient aucune table à compléter.",
    "import.validation.emptyId": "L'identifiant ne peut pas être vide.",
    "import.validation.invalidId":
      "L'identifiant doit commencer par une lettre ou « _ » et ne contenir que des lettres, chiffres et « _ » " +
      "(pas d'espace ni d'accent).",
    "import.validation.duplicateId": "Identifiant utilisé plusieurs fois dans cette sélection.",
    "import.validation.tableExists": "Une table « {id} » existe déjà dans ce document ; choisissez un autre identifiant.",
    "import.action.chooseTarget": "Choisissez une table à compléter",
    "import.action.noNewColumns": "Aucune nouvelle colonne à ajouter",
    "import.action.addColumns": { one: "Ajouter {n} colonne à cette table", other: "Ajouter {n} colonnes à cette table" },
    "import.status.new": "Nouvelle",
    "import.status.existing": "Déjà présente",
    "import.action.createTables": { one: "Créer {n} table dans ce document", other: "Créer {n} tables dans ce document" },
    "import.status.creating": { one: "Création de la table en cours…", other: "Création des tables en cours…" },
    "import.error.tableCollision": {
      one: "Cette table existe déjà dans ce document : {ids}. Choisissez un autre identifiant.",
      other: "Ces tables existent déjà dans ce document : {ids}. Choisissez d'autres identifiants.",
    },
    "import.note.visibleColFailed": {
      one: " Colonne d'affichage (visible_col) non appliquée : {error}.",
      other: " Colonnes d'affichage (visible_col) non appliquées : {error}.",
    },
    "import.success.createdMulti": "{count} tables créées ({ids}), {columnsPhrase} au total.",
    "import.success.createdSingle": "Table « {id} » créée avec {columnsPhrase}.",
    "import.error.createFailed": "Échec de la création : {error}",
    "import.status.addingColumns": "Ajout des colonnes à « {table} » en cours…",
    "import.info.noNewColumns": "Aucune nouvelle colonne : toutes existent déjà dans « {table} » ou ont été décochées.",
    "import.success.columnsAdded": {
      one: "{n} colonne ajoutée à « {table} ».",
      other: "{n} colonnes ajoutées à « {table} ».",
    },
    "import.error.addColumnsFailed": "Échec de l'ajout des colonnes : {error}",
    "import.preview.includeColumn": "Inclure la colonne « {colId} »",

    "export.error.fetchTables": "Impossible de lire les tables de ce document : {error}.",
    "export.refs.intro": {
      one:
        "Les tables cochées font référence à {n} autre table non cochée de ce document. " +
        "L'inclure dans l'export, ou continuer sans elle ?",
      other:
        "Les tables cochées font référence à {n} autres tables non cochées de ce document. " +
        "Les inclure dans l'export, ou continuer sans elles ?",
    },
    "export.refs.item": "{tableId} — référencée par : {columns}",
    "export.status.generating": "Génération du code en cours…",
    "export.success.generated": "Code généré pour {tablesPhrase}, {columnsPhrase} au total.",
    "export.error.generateFailed": "Échec de la génération : {error}.",
    "export.copy.done": "Copié.",
    "export.copy.fallback":
      "Copie automatique indisponible ici : le texte est sélectionné, utilisez Ctrl+C (Cmd+C sur Mac).",
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
    "import.step1.label":
      "A table's Python code (from the source document's “Code View” menu, or this widget's Export tab for detailed choices)",
    "import.step1.placeholder": "@grist.UserTable\nclass MyTable:\n  MyColumn = grist.Text()",
    "import.analyze": "Analyze",
    "import.clear": "Clear",
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
    "import.preview.include": "Include",
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

    // --- Dynamic status/warning messages — see the matching fr. block above.
    "error.noGristApi":
      "Could not find the Grist API. Open this page as a custom widget inside a Grist document " +
      "(it does not work standalone, outside of a document).",
    "error.timeout": "Timed out waiting for a response from the Grist document.",
    "common.tablesCount": { one: "{n} table", other: "{n} tables" },
    "common.columnsCount": { one: "{n} column", other: "{n} columns" },

    "warn.invalidWidgetOptions": "Column “{columnId}”: widget_options is not valid JSON, ignored.",
    "warn.dateTimeNoTimezone": "Column “{columnId}”: no timezone given for DateTime, defaulting to “{timezone}” (please check).",
    "warn.refTargetMissingSyntax": "Column “{columnId}”: no target table found for {dslType}, imported as “Any”.",
    "warn.unknownType": "Column “{columnId}”: unrecognized type “{dslType}”, imported as “Any”.",

    "warn.decoratorNoClass":
      'Line {line}: "@grist.UserTable" is not followed by a valid class ("class TableName:"), ignored.',
    "warn.noTableFound": 'No table found: the text must contain an "@grist.UserTable" block followed by "class TableName:".',
    "warn.formulaTypeNoFunction": "Line {line}: formulaType decorator not followed by a function, ignored.",
    "warn.formulaTypeDuplicate": "Line {line}: duplicate formulaType decorator, the previous one is ignored.",
    "warn.unknownDecorator": "Line {line}: unrecognized decorator ignored ({snippet}).",
    "warn.unrecognizedContent": "Line {line}: unrecognized content ignored ({snippet}).",
    "warn.reservedColumnId": "Line {line}: column “{id}” ignored (reserved identifier, already handled by Grist).",
    "warn.duplicateColumnId": "Line {line}: duplicate column “{id}”, Grist will automatically add a suffix.",
    "warn.tablePrefix": "Table “{tableId}” — {message}",

    "import.error.fetchDocInfo": "Could not retrieve this document's information: {error}.",
    "import.error.fetchExistingTables": "Could not read this document's existing tables: {error}.",
    "warn.refTargetMissingInDoc":
      "Column “{colId}”: the target table “{target}” does not exist in this document, imported as “Any” " +
      "(you can reconfigure it as a Reference once the target table is created).",
    "warn.visibleColMissing":
      "Column “{colId}”: display column “{visibleColId}” not found in this document's “{target}” table, ignored (visible_col).",
    "import.status.analyzing": "Analyzing the document…",
    "import.error.noTableList": "Could not load this document's table list.",
    "import.error.noTablesToComplete": "This document has no table to add columns to.",
    "import.validation.emptyId": "The identifier cannot be empty.",
    "import.validation.invalidId":
      "The identifier must start with a letter or “_” and contain only letters, digits and “_” (no spaces or accents).",
    "import.validation.duplicateId": "This identifier is used more than once in this selection.",
    "import.validation.tableExists": "A table “{id}” already exists in this document; choose another identifier.",
    "import.action.chooseTarget": "Choose a table to complete",
    "import.action.noNewColumns": "No new column to add",
    "import.action.addColumns": { one: "Add {n} column to this table", other: "Add {n} columns to this table" },
    "import.status.new": "New",
    "import.status.existing": "Already present",
    "import.action.createTables": { one: "Create {n} table in this document", other: "Create {n} tables in this document" },
    "import.status.creating": { one: "Creating the table…", other: "Creating the tables…" },
    "import.error.tableCollision": {
      one: "This table already exists in this document: {ids}. Choose another identifier.",
      other: "These tables already exist in this document: {ids}. Choose other identifiers.",
    },
    "import.note.visibleColFailed": {
      one: " Display column (visible_col) not applied: {error}.",
      other: " Display columns (visible_col) not applied: {error}.",
    },
    "import.success.createdMulti": "{count} tables created ({ids}), {columnsPhrase} in total.",
    "import.success.createdSingle": "Table “{id}” created with {columnsPhrase}.",
    "import.error.createFailed": "Creation failed: {error}",
    "import.status.addingColumns": "Adding columns to “{table}”…",
    "import.info.noNewColumns": "No new column: they already all exist in “{table}” or were unchecked.",
    "import.success.columnsAdded": {
      one: "{n} column added to “{table}”.",
      other: "{n} columns added to “{table}”.",
    },
    "import.error.addColumnsFailed": "Failed to add columns: {error}",
    "import.preview.includeColumn": "Include column “{colId}”",

    "export.error.fetchTables": "Could not read this document's tables: {error}.",
    "export.refs.intro": {
      one:
        "The checked tables reference {n} other unchecked table in this document. " +
        "Include it in the export, or continue without it?",
      other:
        "The checked tables reference {n} other unchecked tables in this document. " +
        "Include them in the export, or continue without them?",
    },
    "export.refs.item": "{tableId} — referenced by: {columns}",
    "export.status.generating": "Generating code…",
    "export.success.generated": "Code generated for {tablesPhrase}, {columnsPhrase} in total.",
    "export.error.generateFailed": "Generation failed: {error}.",
    "export.copy.done": "Copied.",
    "export.copy.fallback": "Automatic copy isn't available here: the text is selected, use Ctrl+C (Cmd+C on Mac).",
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

/**
 * Replaces `{name}` placeholders in `text` with `params[name]`, leaving an
 * unmatched placeholder as-is (rather than silently blanking it) so a
 * missing param stays visibly wrong instead of disappearing quietly.
 */
function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/**
 * `params` is optional and, when given, fills `{name}` placeholders in the
 * resolved string (see interpolate above) — used for every dynamic
 * status/warning message in the app; `t(key)` with no params is exactly the
 * original behavior, used for static chrome strings via data-i18n.
 */
export function t(key, params) {
  const raw = (STRINGS[currentLocale] && STRINGS[currentLocale][key]) || STRINGS.fr[key] || key;
  return interpolate(raw, params);
}

/**
 * Pluralized counterpart of t(): `key` must resolve to a `{one, other}`
 * object (not a plain string) in the dictionary. `{n}` in either form is
 * the count itself; `params` adds any further placeholders. Only "one"
 * (count === 1) vs "other" (everything else, including 0) — fr/en both
 * only ever need these two categories for the counts this app displays
 * (tables, columns...), never a language with more plural categories.
 */
export function tn(key, count, params) {
  const entry = (STRINGS[currentLocale] && STRINGS[currentLocale][key]) || STRINGS.fr[key];
  const form = entry && typeof entry === "object" ? (count === 1 ? entry.one : entry.other) : key;
  return interpolate(form, { n: count, ...params });
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
