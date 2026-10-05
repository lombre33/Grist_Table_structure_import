# Sécurité

Ce document décrit la posture de sécurité de ce widget, pensée pour être vérifiable
simplement (revue de code manuelle ou outillée), en vue d'un audit.

## Ce que fait réellement le widget

Les actions possibles, toutes via l'API officielle du widget (`grist.docApi`), jamais
davantage. Aucune des écritures ci-dessous n'est envoyée avant que l'utilisateur ait confirmé,
dans une boîte de dialogue qui résume ce qui sera ajouté (Annuler ou Échap n'écrit rien) :

- **Import, mode « Nouvelle table »** : crée les tables cochées (action `AddTable`, toutes
  dans un seul appel, donc tout ou rien) dans le document où le widget est ouvert, à
  partir du texte collé et analysé.
- **Import, mode « Table existante »** : ajoute des colonnes (actions
  `AddVisibleColumn`, envoyées groupées en un seul appel) à une table déjà présente
  dans ce document — uniquement celles dont l'identifiant n'existe pas déjà sur cette
  table (sans tenir compte des majuscules, comme Grist). `AddVisibleColumn` (plutôt que
  `AddColumn`, qui laisse la colonne invisible dans les grilles déjà existantes, visible
  seulement via « Données sources ») est l'action que Grist lui-même utilise pour que la
  colonne apparaisse immédiatement dans les vues de la table, comme avec le bouton « + »
  natif d'une grille.
- **Import, deuxième temps** : `AddTable` et `AddVisibleColumn` ignorent la description
  d'une colonne, et une « colonne d'affichage » (`visible_col`) a besoin de l'identifiant
  interne d'une colonne qui n'existe qu'une fois les tables créées. Le widget envoie donc
  un second appel `applyUserActions` juste après : `ModifyColumn` (description, référence
  de la colonne d'affichage, indépendance de l'identifiant vis-à-vis du libellé —
  `untieColIdFromLabel`, que `AddTable` ignore aussi) puis `SetDisplayFormula` (fait
  afficher la valeur cible), exactement les actions que l'interface Grist envoie pour
  « SHOW COLUMN ». Pour une table créée dont le texte donne une description (la chaîne qui
  ouvre sa classe), le même appel contient `UpdateRecord` sur `_grist_Views_section`, le
  widget « Données brutes » de la table, où Grist garde la description d'une table
  (`AddTable` ne la reçoit pas). Ces actions
  utilisent les identifiants que Grist a réellement créés (ceux qu'il renvoie, qu'il peut
  avoir réécrits) et ne ciblent **jamais** que des colonnes ou des tables créées par le
  premier appel — jamais une colonne ou une table préexistante. Un échec de ce second appel
  n'annule pas la création déjà faite ; il est signalé séparément à l'utilisateur.
- **Import, références bidirectionnelles** : pour deux colonnes de référence créées par le
  même appel et qui se désignent l'une l'autre (`reverse_of`), un dernier appel envoie
  `ModifyColumn` avec `reverseCol` (l'action que Grist utilise pour relier deux colonnes).
  Il ne cible, lui aussi, que des colonnes créées par le premier appel : relier une colonne
  qui existait déjà réécrirait ses valeurs. Un échec est signalé sans annuler la création.
- **Import, formules (option)** : si l'utilisateur coche **Formules** dans le groupe
  **Éléments à importer** (décoché à chaque analyse), les colonnes de formule et les
  formules de déclenchement du texte sont envoyées à Grist avec le même appel
  `AddTable` / `AddVisibleColumn` (champs `isFormula` et `formula` de la définition de
  colonne). Voir « Le texte collé n'est jamais exécuté » ci-dessous : le widget ne les
  évalue pas, Grist si.
- **Export** : lecture seule. Le widget lit la structure des tables de ce document
  (`grist.docApi.fetchTable` sur les tables de métadonnées `_grist_Tables`,
  `_grist_Tables_column` et `_grist_Views_section` — voir « Lecture des tables de
  métadonnées » ci-dessous) et
  affiche le code généré à l'écran ; rien n'est modifié dans le document, rien n'est
  envoyé où que ce soit. L'utilisateur copie le texte lui-même s'il veut l'utiliser
  ailleurs.

Le widget ne modifie et ne supprime **jamais** de table, colonne ou donnée existante :
il ne fait qu'ajouter (et compléter ce qu'il vient lui-même de créer, ci-dessus). Un
identifiant de table n'est accepté que s'il est un identifiant que Grist crée tel quel
(sinon Grist le réécrit en silence) et s'il n'existe pas déjà, sans tenir compte des
majuscules : vérifié dans l'aperçu, puis de nouveau juste avant l'envoi (relecture de la
liste des tables) pour écarter une collision survenue entre-temps. En mode « Table
existante », une colonne dont l'identifiant est déjà pris n'est jamais touchée, quel que
soit son type réel.

## Lecture des tables de métadonnées

Les modes « Table existante » et « Export » lisent `_grist_Tables`,
`_grist_Tables_column` et `_grist_Views_section` — les tables internes où Grist décrit
lui-même la structure du document (identifiants de table, colonnes, types, et, pour la
description d'une table, son widget « Données brutes »). Ce n'est pas un accès caché ou
détourné : c'est le mécanisme normal `grist.docApi.fetchTable(tableId)` de l'API
publique du widget, appliqué à ces tables comme à n'importe quelle autre — l'implémentation
côté Grist (`GristDocAPIImpl.fetchTable`, dans `app/client/components/WidgetFrame.ts`
du code source de Grist) ne fait aucune distinction entre une table système et une table
utilisateur, seul le niveau d'accès du widget (« full », déjà nécessaire pour créer une
table) est vérifié. Cette lecture reste locale au document : aucune de ces données ne
quitte le navigateur.

## Aucune donnée envoyée à l'extérieur

- Le texte collé par l'utilisateur n'est jamais transmis à un service tiers : il est
  uniquement analysé en mémoire, dans le navigateur (`js/parser.js`).
- Le widget n'effectue **aucun appel réseau applicatif** (pas de `fetch`, pas de
  `XMLHttpRequest`) : la CSP livrée fixe `connect-src 'none'`.
- L'unique échange de données a lieu avec le document Grist qui héberge le widget, via
  `postMessage` (protocole standard des widgets Grist, implémenté par le script officiel
  `grist-plugin-api.js`), pas via HTTP.

## Le texte collé n'est jamais exécuté

`js/parser.js` et `js/pyText.js` ne contiennent ni `eval`, ni `Function(...)`, ni `import()`
dynamique : le texte collé (qui ressemble à du code Python) est uniquement comparé à un
petit ensemble d'expressions régulières fixes et découpé par un scanner de caractères.
Tout ce qui ne correspond pas à un motif reconnu est ignoré et signalé comme avertissement,
sans jamais faire échouer l'analyse ni être interprété comme du code. `test/security.test.mjs`
interdit ces appels dans `js/` à chaque modification, et `test/parser.test.mjs` soumet le
parseur à des milliers de textes d'entrée mutés au hasard (graine fixe) : il ne lève jamais
d'exception et s'arrête toujours vite.

Les **formules** sont le seul cas où du texte collé finit par s'exécuter, et ce n'est pas
dans le widget : sans l'option **Formules** du groupe **Éléments à importer**, aucune
colonne n'est créée avec une formule (`isFormula: false`, `formula: ""` dans chaque définition envoyée ;
`test/grist/importer.test.mjs` le vérifie dans un vrai document, même pour un texte qui
contient du code). Avec l'option, le corps des fonctions est recopié tel quel dans le
champ `formula` d'une colonne, que Grist évalue dans son propre bac à sable Python
exactement comme une formule saisie dans une cellule : le widget n'ajoute ni ne retire
aucun pouvoir à ce code, et ne l'interprète pas (`js/parser.js` n'en lit que l'indentation et
les chaînes, pour savoir où la fonction s'arrête).
L'option est décochée par défaut, et à chaque analyse, accompagnée d'une mise en garde
(« ne cochez “Formules” que pour du code de confiance »), précisément parce que l'origine
d'un texte collé est inconnue. La boîte de confirmation, affichée avant toute écriture, la
répète et nomme les colonnes dont la formule contient le mot `REQUEST` : sur une instance
où cette fonction de Grist est activée, une formule peut s'en servir pour envoyer des
données du document vers un autre serveur (le widget lui-même ne fait aucune requête).
Les autres éléments du groupe (libellés, descriptions des colonnes et des tables, listes de
choix, format des cellules, colonne affichée des références, liens bidirectionnels) ne font
que retirer, au choix de l'utilisateur, une partie de ce que l'import aurait appliqué :
ils n'ajoutent aucun appel ni aucun pouvoir.

## Métadonnées de colonne capturées à l'export (choix, styles, `widget_options`)

L'Export capture, en plus du type de chaque colonne, un ensemble de métadonnées :
libellé (`label`), description, et le contenu de `widgetOptions` propre à la colonne
(dont les valeurs d'une liste de choix et leur style individuel — voir README.md,
section « Export »). Ceci ajoute deux mécanismes, tous deux de la simple analyse de
texte déterministe, jamais de l'évaluation :

- **Un scanner de texte** (`findMatchingClose` et `parseArguments` dans `js/pyText.js`) :
  il parcourt les caractères en comptant la profondeur des parenthèses/crochets, en
  ignorant le contenu des chaînes entre guillemets (simples ou doubles, échappement `\`
  compris) pour qu'une parenthèse ou une virgule littérale dans une valeur (ex. un choix
  nommé `'Oui (confirmé)'`) ne coupe rien. Aucune exécution, aucune interprétation du
  contenu : uniquement un comptage de caractères délimiteurs. Voir `test/pyText.test.mjs`.
- **`JSON.parse` sur la valeur capturée de `widget_options='<JSON>'`**, à l'import
  (`js/gristTypes.js`) : `JSON.parse` n'exécute jamais son argument comme du code
  (contrairement à `eval`) — il ne fait qu'analyser une syntaxe de données stricte et
  échoue sans effet de bord sur tout ce qui n'est pas un JSON valide. Cet appel est de
  plus entouré d'un `try/catch` : une valeur malformée est ignorée (avec un
  avertissement affiché dans l'aperçu), elle ne fait jamais échouer l'import.

Le résultat de ce `JSON.parse` (et, à l'export, le `widgetOptions` brut déjà présent
dans le document) passe systématiquement par `sanitizeWidgetOptions()`
(`js/widgetOptions.js`), qui :

- retire toujours la clé `rulesOptions` (styles de mise en forme conditionnelle) :
  elle n'a de sens qu'associée à un champ `rules` du schéma de la colonne (une liste de
  références vers des colonnes formule cachées) que ce widget ne capture pas — la
  conserver seule produirait un état incohérent, silencieusement inerte, plutôt qu'un
  risque de sécurité en soi ; Grist lui-même l'exclut pour la même raison lors de ses
  propres copies internes de colonnes ;
- réduit `dropdownCondition` à son seul texte de formule (`.text`), sans la version
  compilée (`.parsed`) que seul Grist sait reconstruire correctement à partir du
  document de destination ;
- valide chaque couleur (`textColor`, `fillColor`, et leurs équivalents d'en-tête et,
  par choix, dans `choiceOptions`) avec `/^#[0-9A-Fa-f]{6}$/`, et chaque indicateur
  (gras, italique, souligné, barré, retour à la ligne...) comme un booléen strict :
  toute valeur qui ne correspond pas est simplement omise, jamais écrite telle quelle ;
- pour `choiceOptions`, ne conserve que les clés de style réellement utilisées par
  Grist pour un choix (les mêmes couleurs/indicateurs que ci-dessus), toute autre clé
  étant abandonnée ;
- laisse passer, inchangée, toute autre clé générique non listée ci-dessus (options de
  format propres à chaque type — alignement, devise, format de date... — voir
  README.md) : ce widget n'a pas besoin de connaître par avance chaque clé possible
  pour la restituer fidèlement, seulement celles qui présentent un risque réel ou qui
  n'ont de sens que couplées à des données qu'il ne transporte pas.

Cette même fonction est utilisée à l'export (avant d'écrire `widget_options=`) et à
l'import (sur la valeur reçue), donc un seul et même filtre décide, à un seul endroit
du code, de ce qui est sûr à faire transiter d'un document à l'autre — voir
`test/widgetOptions.test.mjs` pour la couverture de tests de `sanitizeWidgetOptions`.

## Pas d'`innerHTML`

Toute valeur dérivée du texte collé par l'utilisateur (nom de table, nom de colonne,
avertissements) est insérée dans la page via `textContent`, des propriétés du DOM ou des
nœuds texte (`js/dom.js` est le point d'entrée habituel pour construire des éléments),
jamais via `innerHTML`. Cela élimine par construction tout risque d'injection HTML/JS à
partir du texte collé, y compris s'il contient des caractères `<`, `>` ou des
apostrophes. `test/security.test.mjs` vérifie à chaque modification l'absence de
`innerHTML`, `outerHTML`, `insertAdjacentHTML` et `document.write` dans `js/`. Les chaînes
de l'interface bilingue (`js/i18n.js`) sont posées par `textContent` ; le seul élément
inséré dans une phrase (`<code>$Colonne</code>`, astuce de l'onglet Export) est écrit dans
`index.html`.

## Réglages (thème, langue) : `localStorage`, sur une base best-effort

Le panneau « Réglages » (`js/settings.js`, `js/i18n.js`, `js/storage.js`) mémorise deux
préférences d'affichage — thème (système/clair/sombre) et langue (fr/en) — dans le
`localStorage` de l'origine du widget (deux clés, `gristFactory.theme` et
`gristFactory.locale`, aucune autre donnée). Ce n'est ni une donnée du document, ni une
donnée envoyée où que ce soit : elle ne sert qu'à réafficher le même réglage au prochain
chargement, dans ce même navigateur. Le widget s'exécutant dans un `<iframe>`
intégré par Grist, l'accès au stockage peut être partitionné ou bloqué par le
navigateur (protections anti-tracking tierces) : chaque lecture/écriture est entourée
d'un `try/catch` et une indisponibilité ne casse rien, elle fait simplement revenir le
réglage à sa valeur par défaut (thème système, français) au chargement suivant. Un test
vérifie dans le code que ces deux clés sont les seules, et que seuls `js/storage.js` et
`js/theme-init.js` touchent au stockage ; un autre, dans le navigateur, qu'un import et un export
complets ne laissent rien dans `localStorage`, `sessionStorage`, les cookies ni `indexedDB`.

Pour que ce réglage s'applique dès le premier affichage plutôt qu'après le chargement des
modules, un petit script classique, `js/theme-init.js` (une dizaine de lignes, seule autre
source de code du widget avec les modules ES, autorisée par `script-src 'self'`), lit les
deux mêmes clés dans `<head>` et pose l'attribut `data-theme` et la langue de la page, sans
rien interpréter d'autre ; un test vérifie qu'il lit les clés et accepte les valeurs des modules.
Pour un lecteur de l'anglais, dont le balisage est en français, il pose aussi
`data-pending-locale` : la feuille de styles masque alors la page jusqu'à ce que
`js/i18n.js` l'ait traduite (et la révèle d'elle-même après deux secondes si ce module ne
se charge jamais), afin qu'aucun texte français ne s'affiche avant l'anglais.

Le panneau lui-même utilise l'élément natif `<dialog>` (`showModal()`/`close()`) : pas
de gestion maison du focus ni de la touche Échap, ce sont des comportements standard du
navigateur, pas du code spécifique à ce widget.

## Vérification automatisée (CI)

Le workflow `.github/workflows/ci.yml` s'exécute à chaque modification (et le déploiement
GitHub Pages, `pages.yml`, ne part que s'il passe) :

- **tests unitaires et lint de sécurité** (`npm test`, sans dépendance à installer) : les
  motifs interdits dans `js/` (voir ci-dessus) et la vérification qu'`index.html` ne charge
  aucun script en dehors de l'API officielle de Grist et du code du widget, avec une CSP
  qui interdit tout autre accès ;
- **tests navigateur** (le vrai `index.html` dans Chromium, faux `grist` en mémoire) ;
- **tests contre une vraie instance Grist** (image officielle `gristlabs/grist`, épinglée
  par digest) : ce que le widget demande au moteur, l'aller-retour de chaque type de colonne
  et l'interface complète.

Les actions GitHub utilisées sont référencées par l'empreinte du commit d'une version
précise (`actions/checkout@<40 caractères> # v7.0.1`...), non par une étiquette qu'un
dépôt peut déplacer ; `test/security.test.mjs` refuse toute action qui ne l'est pas, et
`.github/dependabot.yml` demande chaque semaine la mise à jour de ces empreintes (et
chaque mois celle des deux dépendances de développement, Playwright et axe-core).

## Dépendances

Aucune dépendance d'exécution (code) dans le dépôt : ni framework, ni bibliothèque tierce
embarquée, pas de `node_modules` livré au navigateur. Le seul script chargé en plus du code
du widget est `grist-plugin-api.js`, la bibliothèque officielle publiée par Grist Labs
(Apache-2.0), nécessaire pour dialoguer avec le document hôte (créer la table, lister les
tables existantes). La page le demande à sa propre origine (`/grist-plugin-api.js`, que
l'instance sert à sa racine) ; la publication GitHub Pages, qui n'est pas une instance, le
télécharge depuis `https://docs.getgrist.com/grist-plugin-api.js` au moment de publier et le
place à côté de `index.html`, avec `assets/grist-plugin-api.NOTICE.txt`. Il n'est pas dans le
dépôt. Voir « Pourquoi servir l'API de Grist avec le widget » ci-dessous.

Une seule ressource statique (pas de code) est vendorisée : la police **Manrope**
(`fonts/manrope/Manrope-Variable.woff2`, licence SIL Open Font License jointe dans le même
dossier), utilisée pour l'interface (voir README.md, identité visuelle) : un sous-ensemble
latin de 28 Ko du fichier d'origine, conservé dans `fonts/manrope/source/` avec la commande
qui le reconstruit (`fonts/manrope/README.md`). Elle est servie
depuis ce même dépôt plutôt que depuis une CDN (ex. Google Fonts) : aucun appel réseau
supplémentaire au chargement, aucun tiers à ajouter à la CSP (`font-src 'self'`
suffit), fichier entièrement auditable dans le dépôt au même titre que le reste du code.

**Playwright** et **axe-core** (`devDependencies`) sont les seules vraies dépendances npm du
dépôt : la première pilote un navigateur pour `test/browser` et `test/grist` (voir README.md,
« Développement »), la seconde y contrôle l'accessibilité de la page (licence MPL-2.0, jamais
redistribuée). Toutes deux, en local et en CI, ne sont déclarées que là : elles n'apparaissent
dans aucun fichier publié (voir `.github/workflows/pages.yml`, dont la liste de copie n'inclut
ni `node_modules/` ni `package.json`) et ne sont jamais chargées par le widget lui-même :
l'affirmation « aucune dépendance d'exécution » ci-dessus reste exacte. L'image Docker de
Grist ne sert qu'aux tests, jamais au widget publié.

Les vulnérabilités connues de ces dépendances sont contrôlées à chaque envoi : l'intégration
continue lance `npm audit --audit-level=high` après `npm ci` (une alerte haute ou critique
fait échouer la construction, donc le déploiement), et `package-lock.json` épingle les versions.
Au 5 octobre 2026, `npm audit` ne signale aucune vulnérabilité (0 sur les dépendances de développement,
0 sur celles d'exécution, qui n'existent pas).

## Logo Grist Factory

`assets/grist-factory-logo.jpg` est une image statique fournie par l'auteur (Grist
Factory), ramenée de 1024 à 96 px (elle s'affiche à 28 px : 2,6 Ko au lieu de 38) et
affichée telle quelle dans l'en-tête (`<img>`, jamais de fond dynamique ni de donnée
utilisateur) ; `img-src 'self'` (déjà en place pour `favicon.svg`) couvre ce fichier sans
modification de la CSP.

## Icônes : SVG en ligne, jamais de police d'icônes

Les icônes de l'interface (Réglages, fermer, effacer, actualiser la liste, copier et son
✓) sont des `<svg>` écrits directement dans `index.html` (les chevrons des groupes qui se
déplient sont dessinés en CSS, par une bordure), en contour (`stroke="currentColor"`, sans `fill`) : elles héritent
la couleur du texte du bouton qui les contient, s'adaptent donc automatiquement au thème
clair/sombre sans code ni fichier supplémentaire. Aucune police d'icônes, aucun emoji,
aucune image externe (`<img>`) : rien de plus que les balises `<svg>` écrites dans le HTML.

## Content-Security-Policy

Appliquée via balise `<meta>` dans `index.html` (GitHub Pages ne permet pas d'ajouter
des en-têtes HTTP personnalisés) :

```
default-src 'none';
script-src 'self' 'unsafe-eval';
style-src 'self';
img-src 'self';
font-src 'self';
connect-src 'none';
base-uri 'none';
form-action 'none';
object-src 'none';
```

Points notables :

- `default-src 'none'` : tout est interdit par défaut, seules les directives listées
  ci-dessous ouvrent explicitement ce qui est nécessaire.
- `script-src` n'autorise que ce qui vient de l'origine de la page : le code du widget et le
  script officiel de Grist, qu'elle sert elle-même (voir « Dépendances ») ; aucun domaine,
  aucune CDN, et `test/security.test.mjs` vérifie que la politique n'en nomme aucun.
- `font-src 'self'` : nécessaire pour que la police Manrope vendorisée
  (`fonts/manrope/`, voir « Dépendances » ci-dessus) se charge — sans `font-src`
  explicite, cette directive retomberait sur `default-src 'none'` et bloquerait même ce
  fichier pourtant local. Limité à `'self'` : aucune police tierce (Google Fonts ou
  autre CDN) ne peut se charger.
- `'unsafe-eval'` est **imposé par le script officiel `grist-plugin-api.js`**, pas par ce
  widget : ce fichier, tel que publié par Grist Labs, est un empaquetage webpack construit
  avec l'option de développement `devtool: eval`, qui encapsule chaque module dans un
  appel `eval(...)` (constaté : près de deux cents occurrences dans le fichier au moment de la rédaction).
  Sans `'unsafe-eval'`, ce script officiel ne s'initialise pas du tout et le widget ne
  fonctionne pas. Le code propre à ce widget (`js/*.js`) n'utilise et n'a besoin d'aucune
  forme d'évaluation dynamique : `test/security.test.mjs` l'atteste à chaque
  modification.
- `style-src 'self'` et deux messages dans la console : dans Grist, la console du
  navigateur affiche deux erreurs sur un style en ligne (« Refused to apply inline
  style… » ou « Applying inline style violates… » selon la version du navigateur). Le
  script officiel crée en effet, dès son chargement, une balise
  `<style id="grist-theme">` (variables de thème et couleurs de barres de défilement de
  Grist) que cette politique refuse volontairement ; le widget n'utilise pas ces
  variables (il a son propre thème), donc aucune conséquence. Autoriser cette balise demanderait
  `'unsafe-inline'` ou une empreinte propre à chaque thème et à chaque version du
  script, ce qui affaiblirait ou fragiliserait la politique.
  `test/grist/inGrist.test.mjs` tolère ces messages, reconnus à leur contenu et non à
  leur formulation, et aucune autre erreur.
- `connect-src 'none'` : le widget ne fait aucun appel réseau applicatif (voir plus haut).
- GitHub Pages ne servant pas d'en-tête `Content-Security-Policy` (seule la balise
  `<meta>` est possible), la directive `frame-ancestors` — qui n'a d'effet que via un
  véritable en-tête HTTP et est ignorée dans une balise `<meta>` — n'est pas incluse ici
  pour éviter de laisser croire à une restriction qui ne serait pas appliquée. Le widget
  doit de toute façon pouvoir être intégré en `<iframe>` par n'importe quel document
  Grist (SaaS ou auto-hébergé) : il n'y a pas d'origine unique à autoriser à l'avance.
  Un opérateur auto-hébergeant ce widget derrière son propre serveur peut ajouter un
  véritable en-tête `Content-Security-Policy: frame-ancestors <origine-de-son-grist>`
  pour restreindre l'intégration à sa seule instance, en défense en profondeur.
- `Referrer-Policy: no-referrer` (balise `<meta name="referrer">`) : évite que l'URL du
  widget (pouvant inclure des paramètres propres au document Grist) ne soit transmise en
  en-tête `Referer` à une autre origine. La page n'en contacte plus aucune ; la balise reste
  en défense en profondeur.

## Portée d'accès demandée à Grist

Le widget appelle `grist.ready({ requiredAccess: "full" })` (le `README.md` détaille, dans
« Accès demandé à Grist », ce qui est lu et écrit, et quand ; `test/security.test.mjs` vérifie
dans le code que les seules actions envoyées sont `AddTable`, `AddVisibleColumn`,
`ModifyColumn`, `SetDisplayFormula` et `UpdateRecord`, que les seules tables lues sont
`_grist_Tables`, `_grist_Tables_column` et `_grist_Views_section`, et qu'aucune ligne de table n'est
lue). Ce niveau est nécessaire
pour créer une table ou des colonnes (`applyUserActions`), lister les tables existantes
(`listTables`) et lire leur structure (`fetchTable`, voir ci-dessus) ; Grist affiche
explicitement à l'utilisateur, lors du premier ajout du widget, une demande
d'autorisation pour ce niveau d'accès — ce consentement est géré par Grist lui-même, pas
par ce widget.

## Pourquoi servir l'API de Grist avec le widget

`grist-plugin-api.js` implémente le protocole `postMessage` propriétaire par lequel Grist
communique avec un widget embarqué. Le réécrire soi-même serait plus risqué (bug de
validation d'origine, de cadrage des messages...) que de réutiliser la bibliothèque officielle,
testée par Grist Labs. La question est donc d'où la page la charge.

Depuis `https://docs.getgrist.com/grist-plugin-api.js` à chaque ouverture, comme le font les
widgets de la galerie de Grist Labs, la page dépendrait d'un domaine tiers : sa disponibilité
(rien ne fonctionne en réseau fermé), l'adresse IP de chaque utilisateur qui lui parvient, et
un code exécuté avec l'accès complet au document qui peut changer à tout moment sans que
personne ici le sache. Pour une instance, la forme attendue est celle qu'utilise le dépôt :
`/grist-plugin-api.js`, que l'instance sert elle-même, à la version de son propre Grist. Pour
GitHub Pages, qui n'est pas une instance, la publication télécharge le fichier une fois, au
moment de publier (adresse officielle, HTTPS, taille et contenu contrôlés, empreinte SHA-256
inscrite dans le résumé de l'exécution) et le publie avec le widget : la page, elle, ne
contacte plus aucun autre domaine.

Ce que cela coûte, dit sans détour : la copie publiée est celle de la dernière publication, elle
ne suit pas seule les correctifs de Grist. On l'actualise en relançant le workflow (onglet
Actions, *Run workflow*) quand Grist publie une nouvelle version de son API. Le widget n'utilise
que des appels de base, `ready`, `docApi.listTables`, `docApi.fetchTable` et
`docApi.applyUserActions`, et la CI le teste contre trois versions de Grist (1.2.1, 1.7.20 et
une version de développement), chacune avec l'API qu'elle sert. Le fichier n'est pas rangé dans
le dépôt : ce serait y porter près d'un mégaoctet de code empaqueté en `eval` que personne n'y
relit. Pour un déploiement en réseau fermé, voir la section correspondante dans le `README.md`.

## Signaler une vulnérabilité

Ne décrivez pas une faille exploitable dans une *issue* publique : elle serait connue de
tous avant d'être corrigée. Utilisez le signalement privé de GitHub (onglet **Security** du
dépôt, puis **Report a vulnerability**) en décrivant le problème et, si possible, les étapes
de reproduction. Si ce bouton n'est pas proposé, ouvrez une *issue* qui demande seulement un
contact privé, sans rien dire de la faille.
