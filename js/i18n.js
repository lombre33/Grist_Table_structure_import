/**
 * French and English texts, and how they are used.
 *
 * - translate(key, params) fills {name} placeholders; translatePlural(key, count, params) picks the singular or the plural
 *   form of a { one, other } entry by the plural rules of the language (in French, zero is singular) and offers {n}.
 * - A key reads `area.element.part`. Both languages have the same keys, with the same plural forms and placeholders;
 *   test/i18n.test.mjs checks it, and that every key is used and none is missing.
 * - The static markup of index.html carries the French and names its key in data-i18n (the text), data-i18n-placeholder,
 *   data-i18n-aria-label or data-i18n-title. applyI18n() writes the language chosen over it, and a test checks that the
 *   French of the markup is the French below, so that nothing moves when the script takes over.
 * - French typography: a no-break space before : ; ? ! and » and after «; ’ for the apostrophe, in both languages (tested).
 * - What the widget says while it works is built at that moment: onLocaleChange() lets it be built again in the new language.
 */

import { load, save } from "./storage.js";

export const STRINGS = {
  fr: {
    // The static texts, in the order of index.html: the Réglages dialog, the heading and the tabs, then the Import steps.
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
      "À copier depuis « Code View » dans le document d’origine, ou depuis l’onglet Export de ce widget. Il est " +
      "analysé dès qu’il est collé.",
    "import.step1.placeholder": "@grist.UserTable\nclass MaTable:\n  MaColonne = grist.Text()",
    "import.analyze": "Analyser",
    "import.clear": "Effacer",
    "import.mode.label": "Que faire de ce code ?",
    "import.mode.create.title": "Nouvelle table",
    "import.mode.create.desc": "Crée une table dédiée avec toutes les colonnes détectées. Recommandé.",
    "import.mode.existing.title": "Table existante",
    "import.mode.existing.desc": "Ajoute uniquement les colonnes qui manquent à une table de ce document.",
    "import.step2.eyebrow": "2. Vérification avant application",
    "import.tablePicker.label": "Table à importer (plusieurs trouvées)",
    "import.tableMultiPicker.label": "Tables à créer (plusieurs trouvées)",
    "import.tableId.label": { one: "Identifiant de la nouvelle table", other: "Identifiants des nouvelles tables" },
    "import.step2.none": "Résultat de l’analyse",
    "import.targetTable.label": "Table à compléter",
    "import.preview.includeAll": "Inclure toutes les colonnes",
    "import.preview.fromTable": "depuis {tableId}",
    "import.preview.column": "Colonne",
    "import.preview.type": "Type Grist",
    "import.preview.status": "Statut",
    "import.preview.formula": "formule",
    "import.preview.trigger": "formule de déclenchement",
    // The elements a column carries besides its type (see elements.js): the name of each and the line that says what it is,
    // the same for Import and Export. The summary of the choice (elements.summary.*) is written on the folded group.
    "element.labels": "Libellés",
    "element.labels.hint": "Le nom affiché de chaque colonne, s’il diffère de son identifiant.",
    "element.descriptions": "Descriptions des colonnes",
    "element.descriptions.hint": "Le texte d’aide de chaque colonne.",
    "element.tableDescriptions": "Descriptions des tables",
    "element.tableDescriptions.hint": "Le texte d’aide de la table.",
    "element.choices": "Listes de choix",
    "element.choices.hint": "Les choix proposés, avec leurs couleurs.",
    "element.options": "Format des cellules",
    "element.options.hint": "Alignement, formats de nombre et de date, couleurs…",
    "element.displayColumns": "Colonne affichée des références",
    "element.displayColumns.hint": "Quelle colonne de la table liée la cellule d’une référence affiche.",
    "element.twoWay": "Liens bidirectionnels",
    "element.twoWay.hint": "Deux références qui se mettent à jour l’une l’autre.",
    "element.formulas": "Formules",
    "element.formulas.hint": "Formules des colonnes calculées et formules de déclenchement.",
    "import.elements.legend": "Éléments à importer",
    "import.elements.hint":
      "Seuls les éléments présents dans le texte collé sont proposés ; le type de chaque colonne est toujours importé.",
    "import.formulas.hint":
      "Les formules s’exécutent dans ce document dès leur création : ne cochez « Formules » que pour du code de " +
      "confiance. Sans cela, ces colonnes sont créées vides.",
    "import.warnings.eyebrow": "Remarques",
    "import.action.create": "Créer la table dans ce document",
    // The Export steps: the list of tables with its search and the choice of columns of each, the elements, the copy.
    "export.step1.eyebrow": "1. Tables à exporter",
    "export.tables.empty": "Aucune table exportable trouvée dans ce document.",
    "export.selectAll": "Tout cocher",
    "export.selectAllShown": "Cocher les tables affichées",
    "export.search.label": "Rechercher une table",
    "export.search.placeholder": "Rechercher une table…",
    "export.search.count": { one: "{n} table affichée sur {total}.", other: "{n} tables affichées sur {total}." },
    "export.search.none": "Aucune table ne correspond à « {query} ».",
    "export.search.hiddenTicked": { one: "{n} table cochée est masquée.", other: "{n} tables cochées sont masquées." },
    "export.elements.legend": "Éléments à exporter",
    "export.elements.hint": "Le type de chaque colonne est toujours exporté.",
    "elements.summary.all": "Tous",
    "elements.summary.none": "Aucun",
    "elements.summary.without": "Sans {names}",
    "elements.summary.some": "{kept} sur {total}",
    "export.refresh": "Actualiser la liste",
    "export.columns.toggle": "Choisir les colonnes de {tableId}",
    "export.columns.group": "Colonnes de {tableId}",
    "export.columns.some": { one: "{n} colonne sur {total}", other: "{n} colonnes sur {total}" },
    "export.generate": "Générer le code",
    "export.step2.eyebrow": "2. Code généré",
    "export.copy": "Copier le code",
    "export.formulaHint.before":
      "Seule la structure (types de colonnes) est garantie fidèle. Pour une colonne de formule, " +
      "la formule d’origine est recopiée telle que stockée (syntaxe ",
    "export.formulaHint.after":
      " de Grist) quand elle existe, sinon remplacée par la valeur par défaut du type — comme le fait " +
      "Grist lui-même pour une formule vide.",

    // What the widget says while it works. First what both tabs share: the errors, and the counts that sentences are built from.
    "error.noGristApi":
      "Impossible de trouver l’API Grist. Ouvrez cette page en tant que widget personnalisé " +
      "dans un document Grist (elle ne fonctionne pas seule, hors d’un document), avec le fichier " +
      "grist-plugin-api.js servi à côté d’elle (voir le README).",
    "error.timeout": "Délai dépassé en attendant la réponse du document Grist.",
    "error.noWriteAccess": "Vous n’avez pas le droit de modifier ce document ({error}).",
    "error.writeTimeout": "Grist n’a pas répondu à l’écriture dans le délai prévu (deux minutes). Elle a pu aboutir : vérifiez le document avant de recommencer.",
    "common.tablesCount": { one: "{n} table", other: "{n} tables" },
    "common.columnsCount": { one: "{n} colonne", other: "{n} colonnes" },
    // The name of each type of column in the preview ({arg} is the table a reference points to, or the time zone); see typeLabel().
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

    // The notes about the text that was read (parser.js) and about what would be created (importer.js), listed under the preview.
    "warn.invalidWidgetOptions": "Colonne « {colId} » : widget_options n’est pas un JSON valide, ignoré.",
    "warn.unreadableOption": "Colonne « {colId} » : l’option « {option} » n’est pas lisible telle qu’écrite ({given}), ignorée ou lue en partie.",
    "warn.dateTimeNoTimezone":
      "Colonne « {colId} » : fuseau horaire non précisé pour DateTime, « {timezone} » utilisé par défaut (à vérifier).",
    "warn.dateTimeBadTimezone": "Colonne « {colId} » : « {given} » n’est pas un nom de fuseau horaire, « {timezone} » utilisé par défaut (à vérifier).",
    "warn.refTargetMissingSyntax": "Colonne « {colId} » : table cible introuvable pour {dslType}, importée en tant que « Any ».",
    "warn.unknownType": "Colonne « {colId} » : type « {dslType} » non reconnu, importée en tant que « Any ».",

    "warn.decoratorNoClass":
      "Ligne {line} : « @grist.UserTable » n’est pas suivi d’une classe valide (« class NomTable: »), ignoré.",
    "warn.noTableFound": "Aucune table trouvée : le texte doit contenir un bloc « @grist.UserTable » suivi de « class NomTable: ».",
    "warn.formulaTypeNoFunction": "Ligne {line} : décorateur formulaType non suivi d’une fonction, ignoré.",
    "warn.formulaTypeDuplicate": "Ligne {line} : décorateur formulaType en double, le précédent est ignoré.",
    "warn.unknownDecorator": "Ligne {line} : décorateur non reconnu ignoré ({snippet}).",
    "warn.unrecognizedContent": "Ligne {line} : contenu non reconnu ignoré ({snippet}).",
    "warn.reservedColumnId": "Ligne {line} : colonne « {colId} » ignorée (identifiant réservé, déjà géré par Grist).",
    "warn.duplicateColumnId": "Ligne {line} : colonne « {colId} » en double (Grist ignore la casse des identifiants), ignorée.",
    "warn.computedColumns": "Colonnes calculées (formule ou formule de déclenchement), créées vides : {columns}.",
    "warn.twoWayColumns":
      "Références bidirectionnelles créées comme références simples (la colonne réciproque n’est pas créée en même " +
      "temps) : {columns}.",
    "warn.tablePrefix": "Table « {tableId} » — {message}",
    "warn.more": { one: "… et {n} autre remarque non affichée.", other: "… et {n} autres remarques non affichées." },

    "import.error.fetchDocInfo": "Impossible de récupérer les informations de ce document : {error}",
    "warn.refTargetMissingInDoc":
      "Colonne « {colId} » : la table cible « {target} » n’existe pas dans ce document, importée en tant que « Any » " +
      "(vous pourrez la reconfigurer en Référence une fois la table cible créée).",
    "warn.visibleColMissing":
      "Colonne « {colId} » : colonne d’affichage « {visibleColId} » introuvable dans la table « {target} » de ce " +
      "document, ignorée (visible_col).",
    // Import: reading the document, checking the ids, the label of the action button, then what is said once it ran.
    "import.status.analyzing": "Lecture des tables du document…",
    "import.error.noTableList": "Impossible de charger la liste des tables de ce document.",
    "import.error.noTablesToComplete": "Ce document ne contient aucune table à compléter.",
    "import.validation.emptyId": "L’identifiant ne peut pas être vide.",
    "import.validation.invalidId":
      "L’identifiant doit commencer par une majuscule et ne contenir que des lettres, chiffres et « _ » " +
      "(pas d’espace ni d’accent). « None », « True » et « False » sont réservés.",
    "import.validation.duplicateId": "Identifiant utilisé plusieurs fois dans cette sélection.",
    "import.validation.tableExists": "Une table « {tableId} » existe déjà dans ce document. Choisissez un autre identifiant.",
    "import.action.chooseTarget": "Choisissez une table à compléter",
    "import.action.noNewColumns": "Aucune nouvelle colonne à ajouter",
    "import.action.addColumns": { one: "Ajouter {n} colonne à « {table} »", other: "Ajouter {n} colonnes à « {table} »" },
    "import.action.chooseTables": "Cochez au moins une table",
    "import.action.noColumns": "Aucune colonne à créer",
    "import.action.fixIds": { one: "Corrigez l’identifiant de la table", other: "Corrigez les identifiants des tables" },
    "import.confirm.createTitle": { one: "Créer cette table ?", other: "Créer ces {n} tables ?" },
    "import.confirm.createIntro": "Sera ajouté à ce document :",
    "import.confirm.tableLine": "{tableId} — {columnsPhrase}",
    "import.confirm.addTitle": "Ajouter à « {table} » ?",
    "import.confirm.addIntro": { one: "Cette colonne sera ajoutée :", other: "Ces {n} colonnes seront ajoutées :" },
    "import.confirm.formulas": "Les formules s’exécuteront dans ce document dès leur création : ne confirmez que pour du code de confiance.",
    "import.confirm.request": {
      one: "{columns} : cette formule appelle REQUEST, qui peut envoyer des données de ce document vers un autre serveur. Ne confirmez que si vous faites confiance à ce code.",
      other: "{columns} : ces formules appellent REQUEST, qui peut envoyer des données de ce document vers un autre serveur. Ne confirmez que si vous faites confiance à ce code.",
    },
    "import.confirm.safe": "Rien n’est supprimé ni modifié dans ce qui existe déjà ; le bouton Annuler de Grist défait l’action.",
    "import.confirm.cancel": "Annuler",
    "import.confirm.ok": "Confirmer", // what the button says before the dialog gives it the label of the action it confirms
    "import.status.new": "Nouvelle",
    "import.status.existing": "Déjà présente",
    "import.action.createTables": { one: "Créer {n} table dans ce document", other: "Créer {n} tables dans ce document" },
    "import.status.creating": { one: "Création de la table en cours…", other: "Création des tables en cours…" },
    "import.error.tableCollision": {
      one: "Cette table existe déjà dans ce document : {ids}. Choisissez un autre identifiant.",
      other: "Ces tables existent déjà dans ce document : {ids}. Choisissez d’autres identifiants.",
    },
    "import.note.refineFailed": " Détails des colonnes (descriptions, colonnes d’affichage…) non appliqués : {error}",
    "import.note.linkFailed": " Références bidirectionnelles non reliées : {error}",
    "import.preview.twoWay": "bidirectionnelle",
    "import.success.createdMulti": "{count} tables créées ({ids}), {columnsPhrase} au total.",
    "import.success.createdSingle": "Table « {tableId} » créée avec {columnsPhrase}.",
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

    // Export: the banner of the tables the ticked ones refer to, then what is said as the list is read and the code generated and copied.
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
    "export.note.gone": { one: "{n} table cochée n’existe plus dans ce document : actualisez la liste.", other: "{n} tables cochées n’existent plus dans ce document : actualisez la liste." },
    "export.error.generateFailed": "Échec de la génération : {error}",
    "export.copy.done": "Copié.",
    "export.copy.fallback":
      "Copie automatique indisponible ici : le texte est sélectionné, utilisez Ctrl+C (Cmd+C sur Mac).",
  },
  en: {
    // The same keys in the same order as in French.
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
      "Copy it from “Code View” in the source document, or from this widget’s Export tab. It is analyzed as soon as it " +
      "is pasted.",
    "import.step1.placeholder": "@grist.UserTable\nclass MyTable:\n  MyColumn = grist.Text()",
    "import.analyze": "Analyze",
    "import.clear": "Clear",
    "import.mode.label": "What to do with this code?",
    "import.mode.create.title": "New table",
    "import.mode.create.desc": "Creates a dedicated table with every detected column. Recommended.",
    "import.mode.existing.title": "Existing table",
    "import.mode.existing.desc": "Only adds the columns missing from a table of this document.",
    "import.step2.eyebrow": "2. Review before applying",
    "import.tablePicker.label": "Table to import (several found)",
    "import.tableMultiPicker.label": "Tables to create (several found)",
    "import.tableId.label": { one: "New table’s identifier", other: "New tables’ identifiers" },
    "import.step2.none": "Result of the analysis",
    "import.targetTable.label": "Table to complete",
    "import.preview.includeAll": "Include every column",
    "import.preview.fromTable": "from {tableId}",
    "import.preview.column": "Column",
    "import.preview.type": "Grist type",
    "import.preview.status": "Status",
    "import.preview.formula": "formula",
    "import.preview.trigger": "trigger formula",
    "element.labels": "Labels",
    "element.labels.hint": "The name shown for each column, if it differs from its identifier.",
    "element.descriptions": "Column descriptions",
    "element.descriptions.hint": "The help text of each column.",
    "element.tableDescriptions": "Table descriptions",
    "element.tableDescriptions.hint": "The help text of the table.",
    "element.choices": "Choice lists",
    "element.choices.hint": "The choices offered, with their colors.",
    "element.options": "Cell format",
    "element.options.hint": "Alignment, number and date formats, colors…",
    "element.displayColumns": "Column shown by references",
    "element.displayColumns.hint": "Which column of the linked table a reference cell shows.",
    "element.twoWay": "Two-way links",
    "element.twoWay.hint": "Two references that update each other.",
    "element.formulas": "Formulas",
    "element.formulas.hint": "Formulas of calculated columns, and trigger formulas.",
    "import.elements.legend": "Elements to import",
    "import.elements.hint": "Only the elements found in the pasted text are offered; the type of every column is always imported.",
    "import.formulas.hint":
      "Formulas run in this document as soon as they are created: only tick “Formulas” for code you trust. " +
      "Without it, these columns are created empty.",
    "import.warnings.eyebrow": "Notes",
    "import.action.create": "Create the table in this document",
    "export.step1.eyebrow": "1. Tables to export",
    "export.tables.empty": "No exportable table found in this document.",
    "export.selectAll": "Select all",
    "export.selectAllShown": "Select the tables shown",
    "export.search.label": "Search tables",
    "export.search.placeholder": "Search tables…",
    "export.search.count": { one: "{n} table shown of {total}.", other: "{n} tables shown of {total}." },
    "export.search.none": "No table matches “{query}”.",
    "export.search.hiddenTicked": { one: "{n} ticked table is hidden.", other: "{n} ticked tables are hidden." },
    "export.elements.legend": "Elements to export",
    "export.elements.hint": "The type of every column is always exported.",
    "elements.summary.all": "All",
    "elements.summary.none": "None",
    "elements.summary.without": "Without {names}",
    "elements.summary.some": "{kept} of {total}",
    "export.refresh": "Refresh the list",
    "export.columns.toggle": "Choose the columns of {tableId}",
    "export.columns.group": "Columns of {tableId}",
    "export.columns.some": { one: "{n} of {total} columns", other: "{n} of {total} columns" },
    "export.generate": "Generate code",
    "export.step2.eyebrow": "2. Generated code",
    "export.copy": "Copy the code",
    "export.formulaHint.before":
      "Only the structure (column types) is guaranteed faithful. For a formula column, the " +
      "original formula is copied back exactly as stored (Grist’s ",
    "export.formulaHint.after":
      " syntax) when it exists, otherwise replaced with the type’s default value — just as Grist " +
      "itself does for an empty formula.",

    "error.noGristApi":
      "Could not find the Grist API. Open this page as a custom widget inside a Grist document " +
      "(it does not work standalone, outside of a document), with the file grist-plugin-api.js " +
      "served next to it (see the README).",
    "error.timeout": "Timed out waiting for a response from the Grist document.",
    "error.noWriteAccess": "You are not allowed to change this document ({error}).",
    "error.writeTimeout": "Grist did not answer the write within the time allowed (two minutes). It may still have gone through: check the document before trying again.",
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

    "warn.invalidWidgetOptions": "Column “{colId}”: widget_options is not valid JSON, ignored.",
    "warn.unreadableOption": "Column “{colId}”: the “{option}” option cannot be read as written ({given}), ignored or only partly read.",
    "warn.dateTimeNoTimezone": "Column “{colId}”: no timezone given for DateTime, defaulting to “{timezone}” (please check).",
    "warn.dateTimeBadTimezone": "Column “{colId}”: “{given}” is not the name of a time zone, defaulting to “{timezone}” (please check).",
    "warn.refTargetMissingSyntax": "Column “{colId}”: no target table found for {dslType}, imported as “Any”.",
    "warn.unknownType": "Column “{colId}”: unrecognized type “{dslType}”, imported as “Any”.",

    "warn.decoratorNoClass": "Line {line}: “@grist.UserTable” is not followed by a valid class (“class TableName:”), ignored.",
    "warn.noTableFound": "No table found: the text must contain a “@grist.UserTable” block followed by “class TableName:”.",
    "warn.formulaTypeNoFunction": "Line {line}: formulaType decorator not followed by a function, ignored.",
    "warn.formulaTypeDuplicate": "Line {line}: duplicate formulaType decorator, the previous one is ignored.",
    "warn.unknownDecorator": "Line {line}: unrecognized decorator ignored ({snippet}).",
    "warn.unrecognizedContent": "Line {line}: unrecognized content ignored ({snippet}).",
    "warn.reservedColumnId": "Line {line}: column “{colId}” ignored (reserved identifier, already handled by Grist).",
    "warn.duplicateColumnId": "Line {line}: duplicate column “{colId}” (Grist ignores the case of identifiers), ignored.",
    "warn.computedColumns": "Computed columns (formula or trigger formula), created empty: {columns}.",
    "warn.twoWayColumns":
      "Two-way references created as plain references (their counterpart column is not created with them): {columns}.",
    "warn.tablePrefix": "Table “{tableId}” — {message}",
    "warn.more": { one: "… and {n} more note not shown.", other: "… and {n} more notes not shown." },

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
    "import.validation.tableExists": "A table “{tableId}” already exists in this document. Choose another identifier.",
    "import.action.chooseTarget": "Choose a table to complete",
    "import.action.noNewColumns": "No new column to add",
    "import.action.addColumns": { one: "Add {n} column to “{table}”", other: "Add {n} columns to “{table}”" },
    "import.action.chooseTables": "Tick at least one table",
    "import.action.noColumns": "No column to create",
    "import.action.fixIds": { one: "Fix the table’s identifier", other: "Fix the tables’ identifiers" },
    "import.confirm.createTitle": { one: "Create this table?", other: "Create these {n} tables?" },
    "import.confirm.createIntro": "Will be added to this document:",
    "import.confirm.tableLine": "{tableId} — {columnsPhrase}",
    "import.confirm.addTitle": "Add to “{table}”?",
    "import.confirm.addIntro": { one: "This column will be added:", other: "These {n} columns will be added:" },
    "import.confirm.formulas": "The formulas will run in this document as soon as they are created: only confirm code you trust.",
    "import.confirm.request": {
      one: "{columns}: this formula calls REQUEST, which can send data from this document to another server. Only confirm if you trust this code.",
      other: "{columns}: these formulas call REQUEST, which can send data from this document to another server. Only confirm if you trust this code.",
    },
    "import.confirm.safe": "Nothing that already exists is removed or changed; Grist’s Undo button reverts the action.",
    "import.confirm.cancel": "Cancel",
    "import.confirm.ok": "Confirm",
    "import.status.new": "New",
    "import.status.existing": "Already present",
    "import.action.createTables": { one: "Create {n} table in this document", other: "Create {n} tables in this document" },
    "import.status.creating": { one: "Creating the table…", other: "Creating the tables…" },
    "import.error.tableCollision": {
      one: "This table already exists in this document: {ids}. Choose another identifier.",
      other: "These tables already exist in this document: {ids}. Choose other identifiers.",
    },
    "import.note.refineFailed": " Column details (descriptions, display columns…) not applied: {error}",
    "import.note.linkFailed": " Two-way references not linked: {error}",
    "import.preview.twoWay": "two-way",
    "import.success.createdMulti": "{count} tables created ({ids}), {columnsPhrase} in total.",
    "import.success.createdSingle": "Table “{tableId}” created with {columnsPhrase}.",
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
    "export.note.gone": { one: "{n} ticked table no longer exists in this document: refresh the list.", other: "{n} ticked tables no longer exist in this document: refresh the list." },
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

export function translate(key, params) {
  return interpolate(STRINGS[currentLocale][key] ?? key, params);
}

export function translatePlural(key, count, params) {
  const entry = STRINGS[currentLocale][key];
  return interpolate(entry[new Intl.PluralRules(currentLocale).select(count)] ?? entry.other, { n: count, ...params });
}

/** Readable name of a Grist column type such as "Ref:People" or "DateTime:UTC". */
export function typeLabel(type) {
  const [name, arg] = type.split(":");
  return translate(`type.${name}`, { arg });
}

const BINDINGS = [
  ["data-i18n", (node, text) => (node.textContent = text)],
  ["data-i18n-placeholder", (node, text) => (node.placeholder = text)],
  ["data-i18n-aria-label", (node, text) => node.setAttribute("aria-label", text)],
  ["data-i18n-title", (node, text) => (node.title = text)],
];

function applyI18n() {
  document.documentElement.lang = currentLocale;
  delete document.documentElement.dataset.pendingLocale;
  document.title = translate("app.documentTitle");
  for (const [attribute, apply] of BINDINGS) {
    for (const node of document.querySelectorAll(`[${attribute}]`)) apply(node, translate(node.getAttribute(attribute)));
  }
}

export function initLocale() {
  currentLocale = load(LOCALE_KEY, (value) => Object.hasOwn(STRINGS, value), "fr");
  applyI18n();
  return currentLocale;
}

/** Calls `listener` after every language change, so that text built at runtime can be rebuilt. */
export function onLocaleChange(listener) {
  listeners.push(listener);
}

export function setLocale(value) {
  currentLocale = value;
  save(LOCALE_KEY, currentLocale);
  applyI18n();
  for (const listener of listeners) listener();
}
