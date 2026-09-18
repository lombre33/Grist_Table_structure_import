# Sécurité

Ce document décrit la posture de sécurité de ce widget, pensée pour être vérifiable
simplement (revue de code manuelle ou outillée), en vue d'un audit.

## Ce que fait réellement le widget

Trois actions métier possibles, toutes via l'API officielle du widget
(`grist.docApi`), jamais davantage :

- **Import, mode « Nouvelle table »** : crée une table (action `AddTable`) dans le
  document où le widget est ouvert, à partir du texte collé et analysé.
- **Import, mode « Table existante »** : ajoute des colonnes (actions `AddColumn`,
  envoyées groupées en un seul appel) à une table déjà présente dans ce document —
  uniquement celles dont l'identifiant n'existe pas déjà sur cette table.
- **Import, `visible_col` (colonne d'affichage)** : quand le texte analysé précise,
  pour une colonne de référence, quelle colonne de la table cible utiliser comme
  « colonne d'affichage » (voir « Métadonnées de colonne capturées à l'export » plus
  bas), le widget envoie, dans un second appel `applyUserActions` juste après la
  création, exactement les deux actions que l'interface Grist elle-même envoie quand
  un utilisateur choisit « SHOW COLUMN » : `ModifyColumn` (enregistre la référence)
  puis `SetDisplayFormula` (fait effectivement afficher la valeur cible plutôt que la
  référence brute). Ces deux actions ne ciblent **jamais** que la colonne qui vient
  d'être créée par ce même appel — jamais une colonne préexistante — donc l'invariant
  « le widget n'ajoute, ne modifie ni ne supprime jamais une colonne existante » n'est
  pas affecté. Un échec de ce second appel (par ex. table cible entre-temps
  supprimée) n'annule pas la création déjà effectuée ; il est signalé séparément à
  l'utilisateur.
- **Export** : lecture seule. Le widget lit la structure des tables de ce document
  (`grist.docApi.fetchTable` sur les tables de métadonnées `_grist_Tables` et
  `_grist_Tables_column` — voir « Lecture des tables de métadonnées » ci-dessous) et
  affiche le code généré à l'écran ; rien n'est modifié dans le document, rien n'est
  envoyé où que ce soit. L'utilisateur copie le texte lui-même s'il veut l'utiliser
  ailleurs.

Le widget ne modifie et ne supprime **jamais** de table, colonne ou donnée existante :
il ne fait qu'ajouter (et, pour `visible_col` ci-dessus, compléter une colonne qu'il
vient tout juste de créer lui-même dans le même flux). Si l'identifiant choisi pour une
nouvelle table existe déjà, la création est refusée côté widget (double vérification :
au moment de l'aperçu, puis juste avant l'envoi de l'action, pour éviter une collision
créée entre-temps) ; en mode « Table existante », une colonne dont l'identifiant est
déjà pris sur la table choisie n'est jamais touchée, quel que soit son type réel.

## Lecture des tables de métadonnées

Les modes « Table existante » et « Export » lisent `_grist_Tables` et
`_grist_Tables_column` — les tables internes où Grist décrit lui-même la structure du
document (identifiants de table, colonnes, types...). Ce n'est pas un accès caché ou
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

`js/parser.js` ne contient ni `eval`, ni `Function(...)`, ni `import()` dynamique : le
texte collé (qui ressemble à du code Python) est uniquement comparé à un petit ensemble
d'expressions régulières fixes. Tout ce qui ne correspond pas à un motif reconnu est
ignoré et signalé comme avertissement, sans jamais faire échouer l'analyse ni être
interprété comme du code. Voir `test/parser.test.mjs` (cas « never throws on
arbitrary/malicious-looking input ») pour une vérification automatisée de cette
propriété.

## Métadonnées de colonne capturées à l'export (choix, styles, `widget_options`)

L'Export capture, en plus du type de chaque colonne, un ensemble de métadonnées :
libellé (`label`), description, et le contenu de `widgetOptions` propre à la colonne
(dont les valeurs d'une liste de choix et leur style individuel — voir README.md,
section « Export »). Ceci ajoute deux mécanismes, tous deux de la simple analyse de
texte déterministe, jamais de l'évaluation :

- **Un scanner de profondeur de parenthèses/crochets** (`findMatchingClose` dans
  `js/parser.js`), qui remplace l'ancienne extraction par regex `\(([^)]*)\)` pour
  trouver la parenthèse fermante d'un appel `grist.Xxx(...)` : il compte simplement la
  profondeur d'imbrication caractère par caractère, en ignorant le contenu des chaînes
  entre guillemets (simples ou doubles, avec gestion de l'échappement `\`) pour qu'une
  parenthèse littérale dans une valeur (ex. un choix nommé `'Oui (confirmé)'`) ne
  termine pas la capture prématurément. Aucune exécution, aucune interprétation du
  contenu : uniquement un comptage de caractères délimiteurs. Voir
  `test/parser.test.mjs` pour les cas de test (valeurs avec parenthèses, parenthèses
  non refermées, guillemets échappés).
- **`JSON.parse` sur la valeur capturée de `widget_options='<JSON>'`**, à l'import
  (`js/gristTypes.js`) : `JSON.parse` n'exécute jamais son argument comme du code
  (contrairement à `eval`) — il ne fait qu'analyser une syntaxe de données stricte et
  échoue sans effet de bord sur tout ce qui n'est pas un JSON valide. Cet appel est de
  plus entouré d'un `try/catch` : une valeur malformée est ignorée (avec un
  avertissement affiché dans l'aperçu), elle ne fait jamais échouer l'import.

Le résultat de ce `JSON.parse` (et, à l'export, le `widgetOptions` brut déjà présent
dans le document) passe systématiquement par `sanitizeWidgetOptions()`
(`js/gristTypes.js`), qui :

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
`test/gristTypes.test.mjs` pour la couverture de tests de `sanitizeWidgetOptions`.

## Pas d'`innerHTML`

Toute valeur dérivée du texte collé par l'utilisateur (nom de table, nom de colonne,
avertissements) est insérée dans la page via `textContent` / création de nœuds DOM
(`js/dom.js`), jamais via `innerHTML`. Cela élimine par construction tout risque
d'injection HTML/JS à partir du texte collé, y compris si celui-ci contient des
caractères `<`, `>` ou des apostrophes.

## Vérification automatisée (CI)

Le workflow `.github/workflows/ci.yml` exécute, à chaque modification :

- les tests unitaires (`node --test`, sans dépendance à installer) ;
- une recherche automatique de motifs interdits dans `js/` : `eval(`, `new Function(`,
  `.innerHTML =`, `document.write(` — la construction échoue si l'un de ces motifs
  apparaît ;
- une vérification qu'`index.html` ne référence aucun script externe en dehors de l'API
  officielle Grist et du code du widget lui-même.

## Dépendances

Aucune dépendance d'exécution : ni framework, ni bibliothèque tierce embarquée, pas de
`node_modules` livré au navigateur. Le seul script chargé en plus du code du widget est
`https://docs.getgrist.com/grist-plugin-api.js`, la bibliothèque officielle publiée par
Grist Labs, nécessaire pour dialoguer avec le document hôte (créer la table, lister les
tables existantes). Voir « Pourquoi charger un script externe » ci-dessous pour la
justification de ce choix plutôt qu'un renvoi local.

`package.json` ne sert qu'au développement (lancement des tests avec le module natif
`node:test`) ; il ne déclare aucune dépendance (`dependencies` et `devDependencies`
vides) et n'est pas publié sur le site (voir le workflow de publication).

## Content-Security-Policy

Appliquée via balise `<meta>` dans `index.html` (GitHub Pages ne permet pas d'ajouter
des en-têtes HTTP personnalisés) :

```
default-src 'none';
script-src 'self' https://docs.getgrist.com 'unsafe-eval';
style-src 'self';
img-src 'self';
connect-src 'none';
base-uri 'none';
form-action 'none';
object-src 'none';
```

Points notables :

- `default-src 'none'` : tout est interdit par défaut, seules les directives listées
  ci-dessous ouvrent explicitement ce qui est nécessaire.
- `script-src` n'autorise que le code du widget lui-même et le script officiel Grist ;
  aucun autre domaine, aucune CDN.
- `'unsafe-eval'` est **imposé par le script officiel `grist-plugin-api.js`**, pas par ce
  widget : ce fichier, tel que publié par Grist Labs, est un empaquetage webpack construit
  avec l'option de développement `devtool: eval`, qui encapsule chaque module dans un
  appel `eval(...)` (constaté : 182 occurrences dans le fichier au moment de la rédaction).
  Sans `'unsafe-eval'`, ce script officiel ne s'initialise pas du tout et le widget ne
  fonctionne pas. Le code propre à ce widget (`js/*.js`) n'utilise et n'a besoin d'aucune
  forme d'évaluation dynamique : voir la vérification CI ci-dessus, qui l'atteste sur
  chaque modification.
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
  en-tête `Referer` lors du chargement du script Grist.

## Portée d'accès demandée à Grist

Le widget appelle `grist.ready({ requiredAccess: "full" })`. Ce niveau est nécessaire
pour créer une table ou des colonnes (`applyUserActions`), lister les tables existantes
(`listTables`) et lire leur structure (`fetchTable`, voir ci-dessus) ; Grist affiche
explicitement à l'utilisateur, lors du premier ajout du widget, une demande
d'autorisation pour ce niveau d'accès — ce consentement est géré par Grist lui-même, pas
par ce widget.

## Pourquoi charger un script externe plutôt que le regrouper localement

`grist-plugin-api.js` implémente le protocole `postMessage` propriétaire par lequel
Grist communique avec un widget embarqué. Le réécrire soi-même serait plus risqué (bug
de validation d'origine, de cadrage des messages...) que de réutiliser la bibliothèque
officielle, testée par Grist Labs et automatiquement tenue à jour à chaque chargement
(contrairement à une copie locale figée, qui ne recevrait pas les correctifs de sécurité
ultérieurs de Grist). C'est également le mode d'intégration documenté et utilisé par les
widgets officiels de Grist Labs. Pour un déploiement en réseau fermé, voir la section
correspondante dans le `README.md`.

## Signaler une vulnérabilité

Ouvrez une *issue* sur ce dépôt en décrivant le problème et, si possible, les étapes de
reproduction.
