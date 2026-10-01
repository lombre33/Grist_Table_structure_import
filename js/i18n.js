/**
 * French and English texts. t(key, params) fills {name} placeholders, tn(key, count, params) picks the
 * singular or plural form of a {one, other} entry; the static markup uses data-i18n*, applied by applyI18n().
 */

import { load, save } from "./storage.js";

export const STRINGS = {
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
    "app.lede": "Importez la structure d’une table depuis un autre document, ou exportez celle d’une table de ce document.",
    "tabs.import": "Import",
    "tabs.export": "Export",
    "import.step1.eyebrow": "1. Code source",
    "import.step1.label": "Code Python d’une table",
    "import.step1.hint":
      "À copier depuis le menu « Code View » de la table, dans le document d’origine, ou depuis l’onglet Export de ce " +
      "widget (qui garde en plus les choix détaillés).",
    "import.step1.placeholder": "@grist.UserTable\nclass MaTable:\n  MaColonne = grist.Text()",
    "import.analyze": "Analyser",
    "import.clear": "Effacer",
    "import.step2.eyebrow": "2. Que faire de ce code ?",
    "import.mode.create.title": "Nouvelle table",
    "import.mode.create.desc": "Crée une table dédiée avec toutes les colonnes détectées. Recommandé.",
    "import.mode.existing.title": "Table existante",
    "import.mode.existing.desc": "Ajoute uniquement les colonnes qui manquent à une table de ce document.",
    "import.step3.eyebrow": "3. Vérification avant application",
    "import.tablePicker.label": "Table à importer (plusieurs trouvées)",
    "import.tableMultiPicker.label": "Tables à créer (plusieurs trouvées)",
    "import.tableId.label": { one: "Identifiant de la nouvelle table", other: "Identifiants des nouvelles tables" },
    "import.step3.none": "Résultat de l’analyse",
    "import.targetTable.label": "Table à compléter",
    "import.preview.includeAll": "Inclure toutes les colonnes",
    "import.preview.fromTable": "depuis {tableId}",
    "import.preview.column": "Colonne",
    "import.preview.type": "Type Grist",
    "import.preview.status": "Statut",
    "import.preview.formula": "formule",
    "import.preview.trigger": "formule de déclenchement",
    "import.formulas.option": {
      one: "Reprendre aussi la formule de {n} colonne",
      other: "Reprendre aussi les formules de {n} colonnes",
    },
    "import.formulas.hint":
      "Les formules s’exécutent dans ce document dès leur création : n’activez cette option que pour du code de " +
      "confiance. Sans elle, ces colonnes sont créées vides.",
    "import.warnings.eyebrow": "Remarques",
    "import.action.create": "Créer la table dans ce document",
    "export.step1.eyebrow": "1. Tables à exporter",
    "export.tables.empty": "Aucune table exportable trouvée dans ce document.",
    "export.selectAll": "Tout cocher",
    "export.refresh": "Actualiser la liste",
    "export.generate": "Générer le code",
    "export.step2.eyebrow": "2. Code généré",
    "export.copy": "Copier",
    "export.formulaHint.before":
      "Seule la structure (types de colonnes) est garantie fidèle. Pour une colonne de formule, " +
      "la formule d’origine est recopiée telle que stockée (syntaxe ",
    "export.formulaHint.after":
      " de Grist) quand elle existe, sinon remplacée par la valeur par défaut du type — comme le fait " +
      "Grist lui-même pour une formule vide.",

    "error.noGristApi":
      "Impossible de trouver l’API Grist. Ouvrez cette page en tant que widget personnalisé " +
      "dans un document Grist (elle ne fonctionne pas seule, hors d’un document).",
    "error.timeout": "Délai dépassé en attendant la réponse du document Grist.",
    "common.tablesCount": { one: "{n} table", other: "{n} tables" },
    "common.columnsCount": { one: "{n} colonne", other: "{n} colonnes" },
    "type.Text": "Texte",
    "type.Numeric": "Numérique",
    "type.Int": "Entier",
    "type.Bool": "Case à cocher",
    "type.Date": "Date",
    "type.DateTime": "Date et heure ({arg})",
    "type.Choice": "Choix (liste déroulante)",
    "type.ChoiceList": "Choix multiples (liste déroulante)",
    "type.Ref": "Référence vers « {arg} »",
    "type.RefList": "Références vers « {arg} » (liste)",
    "type.Attachments": "Pièces jointes",
    "type.Blob": "Binaire (Blob)",
    "type.Any": "Quelconque (Any)",

    "warn.invalidWidgetOptions": "Colonne « {columnId} » : widget_options n’est pas un JSON valide, ignoré.",
    "warn.dateTimeNoTimezone":
      "Colonne « {columnId} » : fuseau horaire non précisé pour DateTime, « {timezone} » utilisé par défaut (à vérifier).",
    "warn.refTargetMissingSyntax": "Colonne « {columnId} » : table cible introuvable pour {dslType}, importée en tant que « Any ».",
    "warn.unknownType": "Colonne « {columnId} » : type « {dslType} » non reconnu, importée en tant que « Any ».",

    "warn.decoratorNoClass":
      "Ligne {line} : « @grist.UserTable » n’est pas suivi d’une classe valide (« class NomTable: »), ignoré.",
    "warn.noTableFound": "Aucune table trouvée : le texte doit contenir un bloc « @grist.UserTable » suivi de « class NomTable: ».",
    "warn.formulaTypeNoFunction": "Ligne {line} : décorateur formulaType non suivi d’une fonction, ignoré.",
    "warn.formulaTypeDuplicate": "Ligne {line} : décorateur formulaType en double, le précédent est ignoré.",
    "warn.unknownDecorator": "Ligne {line} : décorateur non reconnu ignoré ({snippet}).",
    "warn.unrecognizedContent": "Ligne {line} : contenu non reconnu ignoré ({snippet}).",
    "warn.reservedColumnId": "Ligne {line} : colonne « {id} » ignorée (identifiant réservé, déjà géré par Grist).",
    "warn.duplicateColumnId": "Ligne {line} : colonne « {id} » en double (Grist ignore la casse des identifiants), ignorée.",
    "warn.computedColumns": "Colonnes calculées (formule ou formule de déclenchement), créées vides : {columns}.",
    "warn.twoWayColumns":
      "Références bidirectionnelles créées comme références simples (la colonne réciproque n’est pas créée en même " +
      "temps) : {columns}.",
    "warn.tablePrefix": "Table « {tableId} » — {message}",

    "import.error.fetchDocInfo": "Impossible de récupérer les informations de ce document : {error}",
    "warn.refTargetMissingInDoc":
      "Colonne « {colId} » : la table cible « {target} » n’existe pas dans ce document, importée en tant que « Any » " +
      "(vous pourrez la reconfigurer en Référence une fois la table cible créée).",
    "warn.visibleColMissing":
      "Colonne « {colId} » : colonne d’affichage « {visibleColId} » introuvable dans la table « {target} » de ce " +
      "document, ignorée (visible_col).",
    "import.status.analyzing": "Lecture des tables du document…",
    "import.error.noTableList": "Impossible de charger la liste des tables de ce document.",
    "import.error.noTablesToComplete": "Ce document ne contient aucune table à compléter.",
    "import.validation.emptyId": "L’identifiant ne peut pas être vide.",
    "import.validation.invalidId":
      "L’identifiant doit commencer par une majuscule et ne contenir que des lettres, chiffres et « _ » " +
      "(pas d’espace ni d’accent). « None », « True » et « False » sont réservés.",
    "import.validation.duplicateId": "Identifiant utilisé plusieurs fois dans cette sélection.",
    "import.validation.tableExists": "Une table « {id} » existe déjà dans ce document. Choisissez un autre identifiant.",
    "import.action.chooseTarget": "Choisissez une table à compléter",
    "import.action.noNewColumns": "Aucune nouvelle colonne à ajouter",
    "import.action.addColumns": { one: "Ajouter {n} colonne à « {table} »", other: "Ajouter {n} colonnes à « {table} »" },
    "import.action.chooseTables": "Cochez au moins une table",
    "import.action.noColumns": "Aucune colonne à créer",
    "import.status.new": "Nouvelle",
    "import.status.existing": "Déjà présente",
    "import.action.createTables": { one: "Créer {n} table dans ce document", other: "Créer {n} tables dans ce document" },
    "import.status.creating": { one: "Création de la table en cours…", other: "Création des tables en cours…" },
    "import.error.tableCollision": {
      one: "Cette table existe déjà dans ce document : {ids}. Choisissez un autre identifiant.",
      other: "Ces tables existent déjà dans ce document : {ids}. Choisissez d’autres identifiants.",
    },
    "import.note.refineFailed": " Détails des colonnes (descriptions, colonnes d’affichage...) non appliqués : {error}",
    "import.note.linkFailed": " Références bidirectionnelles non reliées : {error}",
    "import.preview.twoWay": "bidirectionnelle",
    "import.success.createdMulti": "{count} tables créées ({ids}), {columnsPhrase} au total.",
    "import.success.createdSingle": "Table « {id} » créée avec {columnsPhrase}.",
    "import.error.createFailed": "Échec de la création : {error}",
    "import.status.addingColumns": "Ajout des colonnes à « {table} » en cours…",
    "import.info.noNewColumns": "Aucune nouvelle colonne : toutes existent déjà dans « {table} » ou ont été décochées.",
    "import.success.columnsAdded": {
      one: "{n} colonne ajoutée à « {table} ».",
      other: "{n} colonnes ajoutées à « {table} ».",
    },
    "import.error.addColumnsFailed": "Échec de l’ajout des colonnes : {error}",
    "import.preview.includeColumn": "Inclure la colonne « {colId} »",
    "import.announce.found": "Analyse terminée : {tablesPhrase}, {columnsPhrase} au total.",
    "import.announce.none": "Analyse terminée : aucune table trouvée.",

    "export.error.fetchTables": "Impossible de lire les tables de ce document : {error}",
    "export.refs.intro": {
      one:
        "Les tables cochées font référence à {n} autre table non cochée de ce document. " +
        "L’inclure dans l’export, ou continuer sans elle ?",
      other:
        "Les tables cochées font référence à {n} autres tables non cochées de ce document. " +
        "Les inclure dans l’export, ou continuer sans elles ?",
    },
    "export.refs.item": "{tableId} — référencée par : {columns}",
    "export.refs.include": { one: "Inclure cette table", other: "Inclure ces tables" },
    "export.refs.dismiss": { one: "Continuer sans elle", other: "Continuer sans elles" },
    "export.status.loading": "Lecture des tables du document…",
    "export.status.generating": "Génération du code en cours…",
    "export.success.generated": "Code généré pour {tablesPhrase}, {columnsPhrase} au total.",
    "export.error.generateFailed": "Échec de la génération : {error}",
    "export.copy.done": "Copié.",
    "export.copy.fallback":
      "Copie automatique indisponible ici : le texte est sélectionné, utilisez Ctrl+C (Cmd+C sur Mac).",
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
    "app.lede": "Import a table’s structure from another document, or export the structure of a table of this document.",
    "tabs.import": "Import",
    "tabs.export": "Export",
    "import.step1.eyebrow": "1. Source code",
    "import.step1.label": "A table’s Python code",
    "import.step1.hint":
      "Copy it from the table’s “Code View” menu in the source document, or from this widget’s Export tab (which also " +
      "keeps the detailed choices).",
    "import.step1.placeholder": "@grist.UserTable\nclass MyTable:\n  MyColumn = grist.Text()",
    "import.analyze": "Analyze",
    "import.clear": "Clear",
    "import.step2.eyebrow": "2. What to do with this code?",
    "import.mode.create.title": "New table",
    "import.mode.create.desc": "Creates a dedicated table with every detected column. Recommended.",
    "import.mode.existing.title": "Existing table",
    "import.mode.existing.desc": "Only adds the columns missing from a table of this document.",
    "import.step3.eyebrow": "3. Review before applying",
    "import.tablePicker.label": "Table to import (several found)",
    "import.tableMultiPicker.label": "Tables to create (several found)",
    "import.tableId.label": { one: "New table’s identifier", other: "New tables' identifiers" },
    "import.step3.none": "Result of the analysis",
    "import.targetTable.label": "Table to complete",
    "import.preview.includeAll": "Include every column",
    "import.preview.fromTable": "from {tableId}",
    "import.preview.column": "Column",
    "import.preview.type": "Grist type",
    "import.preview.status": "Status",
    "import.preview.formula": "formula",
    "import.preview.trigger": "trigger formula",
    "import.formulas.option": {
      one: "Also import the formula of {n} column",
      other: "Also import the formulas of {n} columns",
    },
    "import.formulas.hint":
      "Formulas run in this document as soon as they are created: only enable this for code you trust. " +
      "Without it, these columns are created empty.",
    "import.warnings.eyebrow": "Notes",
    "import.action.create": "Create the table in this document",
    "export.step1.eyebrow": "1. Tables to export",
    "export.tables.empty": "No exportable table found in this document.",
    "export.selectAll": "Select all",
    "export.refresh": "Refresh the list",
    "export.generate": "Generate code",
    "export.step2.eyebrow": "2. Generated code",
    "export.copy": "Copy",
    "export.formulaHint.before":
      "Only the structure (column types) is guaranteed faithful. For a formula column, the " +
      "original formula is copied back exactly as stored (Grist’s ",
    "export.formulaHint.after":
      " syntax) when it exists, otherwise replaced with the type’s default value — just as Grist " +
      "itself does for an empty formula.",

    "error.noGristApi":
      "Could not find the Grist API. Open this page as a custom widget inside a Grist document " +
      "(it does not work standalone, outside of a document).",
    "error.timeout": "Timed out waiting for a response from the Grist document.",
    "common.tablesCount": { one: "{n} table", other: "{n} tables" },
    "common.columnsCount": { one: "{n} column", other: "{n} columns" },
    "type.Text": "Text",
    "type.Numeric": "Numeric",
    "type.Int": "Integer",
    "type.Bool": "Checkbox",
    "type.Date": "Date",
    "type.DateTime": "Date and time ({arg})",
    "type.Choice": "Choice (dropdown)",
    "type.ChoiceList": "Multiple choice (dropdown)",
    "type.Ref": "Reference to “{arg}”",
    "type.RefList": "References to “{arg}” (list)",
    "type.Attachments": "Attachments",
    "type.Blob": "Binary (Blob)",
    "type.Any": "Any",

    "warn.invalidWidgetOptions": "Column “{columnId}”: widget_options is not valid JSON, ignored.",
    "warn.dateTimeNoTimezone": "Column “{columnId}”: no timezone given for DateTime, defaulting to “{timezone}” (please check).",
    "warn.refTargetMissingSyntax": "Column “{columnId}”: no target table found for {dslType}, imported as “Any”.",
    "warn.unknownType": "Column “{columnId}”: unrecognized type “{dslType}”, imported as “Any”.",

    "warn.decoratorNoClass": "Line {line}: “@grist.UserTable” is not followed by a valid class (“class TableName:”), ignored.",
    "warn.noTableFound": "No table found: the text must contain a “@grist.UserTable” block followed by “class TableName:”.",
    "warn.formulaTypeNoFunction": "Line {line}: formulaType decorator not followed by a function, ignored.",
    "warn.formulaTypeDuplicate": "Line {line}: duplicate formulaType decorator, the previous one is ignored.",
    "warn.unknownDecorator": "Line {line}: unrecognized decorator ignored ({snippet}).",
    "warn.unrecognizedContent": "Line {line}: unrecognized content ignored ({snippet}).",
    "warn.reservedColumnId": "Line {line}: column “{id}” ignored (reserved identifier, already handled by Grist).",
    "warn.duplicateColumnId": "Line {line}: duplicate column “{id}” (Grist ignores the case of identifiers), ignored.",
    "warn.computedColumns": "Computed columns (formula or trigger formula), created empty: {columns}.",
    "warn.twoWayColumns":
      "Two-way references created as plain references (their counterpart column is not created with them): {columns}.",
    "warn.tablePrefix": "Table “{tableId}” — {message}",

    "import.error.fetchDocInfo": "Could not retrieve this document’s information: {error}",
    "warn.refTargetMissingInDoc":
      "Column “{colId}”: the target table “{target}” does not exist in this document, imported as “Any” " +
      "(you can reconfigure it as a Reference once the target table is created).",
    "warn.visibleColMissing":
      "Column “{colId}”: display column “{visibleColId}” not found in this document’s “{target}” table, ignored (visible_col).",
    "import.status.analyzing": "Reading this document’s tables…",
    "import.error.noTableList": "Could not load this document’s table list.",
    "import.error.noTablesToComplete": "This document has no table to add columns to.",
    "import.validation.emptyId": "The identifier cannot be empty.",
    "import.validation.invalidId":
      "The identifier must start with a capital letter and contain only letters, digits and “_” (no spaces or accents). " +
      "“None”, “True” and “False” are reserved.",
    "import.validation.duplicateId": "This identifier is used more than once in this selection.",
    "import.validation.tableExists": "A table “{id}” already exists in this document. Choose another identifier.",
    "import.action.chooseTarget": "Choose a table to complete",
    "import.action.noNewColumns": "No new column to add",
    "import.action.addColumns": { one: "Add {n} column to “{table}”", other: "Add {n} columns to “{table}”" },
    "import.action.chooseTables": "Tick at least one table",
    "import.action.noColumns": "No column to create",
    "import.status.new": "New",
    "import.status.existing": "Already present",
    "import.action.createTables": { one: "Create {n} table in this document", other: "Create {n} tables in this document" },
    "import.status.creating": { one: "Creating the table…", other: "Creating the tables…" },
    "import.error.tableCollision": {
      one: "This table already exists in this document: {ids}. Choose another identifier.",
      other: "These tables already exist in this document: {ids}. Choose other identifiers.",
    },
    "import.note.refineFailed": " Column details (descriptions, display columns...) not applied: {error}",
    "import.note.linkFailed": " Two-way references not linked: {error}",
    "import.preview.twoWay": "two-way",
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
    "import.announce.found": "Analysis done: {tablesPhrase}, {columnsPhrase} in total.",
    "import.announce.none": "Analysis done: no table found.",

    "export.error.fetchTables": "Could not read this document’s tables: {error}",
    "export.refs.intro": {
      one:
        "The checked tables reference {n} other unchecked table in this document. " +
        "Include it in the export, or continue without it?",
      other:
        "The checked tables reference {n} other unchecked tables in this document. " +
        "Include them in the export, or continue without them?",
    },
    "export.refs.item": "{tableId} — referenced by: {columns}",
    "export.refs.include": { one: "Include this table", other: "Include these tables" },
    "export.refs.dismiss": { one: "Continue without it", other: "Continue without them" },
    "export.status.loading": "Reading this document’s tables…",
    "export.status.generating": "Generating code…",
    "export.success.generated": "Code generated for {tablesPhrase}, {columnsPhrase} in total.",
    "export.error.generateFailed": "Generation failed: {error}",
    "export.copy.done": "Copied.",
    "export.copy.fallback": "Automatic copy isn’t available here: the text is selected, use Ctrl+C (Cmd+C on Mac).",
  },
};

const LOCALE_KEY = "gristFactory.locale";
let currentLocale = "fr";
const listeners = [];

/** An unmatched placeholder is left as it is, so that a missing parameter shows instead of vanishing. */
function interpolate(text, params) {
  return params ? text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : text;
}

export function t(key, params) {
  return interpolate(STRINGS[currentLocale][key] ?? key, params);
}

export function tn(key, count, params) {
  const entry = STRINGS[currentLocale][key];
  return interpolate(entry[new Intl.PluralRules(currentLocale).select(count)] ?? entry.other, { n: count, ...params });
}

/** Readable name of a Grist column type such as "Ref:People" or "DateTime:UTC". */
export function typeLabel(type) {
  const [name, arg] = type.split(":");
  return t(`type.${name}`, { arg });
}

const BINDINGS = [
  ["data-i18n", (node, text) => (node.textContent = text)],
  ["data-i18n-placeholder", (node, text) => (node.placeholder = text)],
  ["data-i18n-aria-label", (node, text) => node.setAttribute("aria-label", text)],
];

function applyI18n() {
  document.documentElement.lang = currentLocale;
  document.title = t("app.documentTitle");
  for (const [attribute, apply] of BINDINGS) {
    for (const node of document.querySelectorAll(`[${attribute}]`)) apply(node, t(node.getAttribute(attribute)));
  }
}

export function initLocale() {
  currentLocale = load(LOCALE_KEY, (value) => value in STRINGS, "fr");
  applyI18n();
  return currentLocale;
}

/** Calls `listener` after every language change, so that text built at runtime can be rebuilt. */
export function onLocaleChange(listener) {
  listeners.push(listener);
}

export function setLocale(value) {
  currentLocale = value in STRINGS ? value : "fr";
  save(LOCALE_KEY, currentLocale);
  applyI18n();
  for (const listener of listeners) listener();
}
