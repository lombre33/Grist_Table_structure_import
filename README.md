# Structure de table Grist — Import / Export

Widget personnalisé pour [Grist](https://www.getgrist.com/), à héberger sur GitHub Pages.

Deux onglets :

- **Import** : recrée, dans le document Grist où le widget est ajouté, la structure
  d'une table (colonnes, types, références...) à partir de son code Python (menu de la
  table, « Code View »), copié depuis n'importe quel document Grist ; on choisit ce qu'on
  reprend, colonne par colonne et par élément (libellés, descriptions, choix, formules...).
- **Export** : choisit une ou plusieurs tables de **ce** document, et ce qu'on en garde
  (les mêmes éléments), puis génère leur code, au même format, prêt à être collé ailleurs
  (y compris dans ce même widget, dans un autre document).

Aucune donnée n'est envoyée où que ce soit : tout est lu et analysé entièrement dans le
navigateur, et la seule action effectuée sur demande est la création d'une table ou
l'ajout de colonnes dans le document Grist courant, via l'API officielle du widget.

## Import

1. Dans le document Grist source, ouvrez la table à dupliquer puis son menu **Code View**
   pour obtenir son code (voir exemple ci-dessous) — ou utilisez l'onglet **Export** de ce
   même widget sur ce document.
2. Dans le document Grist de destination, ouvrez l'onglet **Import**, collez le code dans
   la zone de texte, puis cliquez sur **Analyser**.
3. Choisissez ce qu'il doit se passer :
   - **Nouvelle table** (recommandé, sélectionné par défaut) : crée une table dédiée avec
     toutes les colonnes détectées. Si le texte collé contient plusieurs tables, elles
     sont toutes cochées par défaut ; décochez celles à ne pas créer. L'aperçu affiche
     alors les colonnes de chaque table cochée à la suite, séparées par un intitulé
     discret, avec un champ d'identifiant par table (pré-rempli avec le nom d'origine,
     première lettre en majuscule, modifiable) — tout est créé en une seule fois, en un
     seul clic, et les références entre ces tables sont conservées (elles suivent le
     nouvel identifiant si vous en changez un).
   - **Table existante** : ajoute uniquement les colonnes qui manquent à une table déjà
     présente dans ce document (une seule table source à la fois) ; les colonnes dont
     l'identifiant existe déjà sur la table choisie — sans tenir compte des majuscules,
     comme Grist — sont repérées « Déjà présente » dans l'aperçu et ignorées : leur type
     n'est jamais modifié. Les colonnes ajoutées apparaissent immédiatement dans les
     grilles déjà existantes de cette table, pas seulement dans « Données sources ».
4. Vérifiez l'aperçu (types détectés, colonnes ignorées, remarques éventuelles) — chaque
   colonne a sa propre case à cocher (cochée par défaut, la case de l'en-tête les coche ou
   les décoche toutes) pour l'exclure individuellement de l'action, en plus de la sélection
   par table ; une colonne décochée est grisée. Sous l'aperçu, le groupe **Éléments à
   importer** liste ce que le texte contient au-delà du type des colonnes (voir plus bas) :
   tout y est coché par défaut, sauf les formules. Cliquez ensuite sur le bouton d'action.
   Le bouton **Effacer**, à côté d'Analyser, réinitialise entièrement l'onglet pour
   recommencer avec un autre texte.

Le widget ne modifie ni ne supprime jamais une colonne ou une table existante : en mode
« Nouvelle table », un identifiant déjà pris (sans tenir compte des majuscules, y compris
entre deux tables de la même sélection) est refusé ; en mode « Table existante », seules
les colonnes absentes sont ajoutées. Un identifiant de table doit être un identifiant
que Grist crée tel quel : majuscule initiale, puis lettres, chiffres ou `_` (ni accent, ni
espace, ni `None`/`True`/`False`) ; sinon Grist le réécrirait en silence.

Aucune confirmation n'est demandée avant de cliquer sur le bouton d'action : c'est un
choix délibéré, pas un oubli. Les actions de ce widget sont strictement additives (jamais
de suppression ni de modification d'une colonne ou table existante, voir ci-dessus), et le
bouton lui-même annonce déjà précisément la portée de l'action (« Créer 2 tables dans ce
document », « Ajouter 3 colonnes à cette table »...) au moment de cliquer — une boîte de
dialogue de confirmation ajouterait une étape sans réduire aucun risque réel ici. Le
filet de sécurité reste, comme pour toute action dans Grist, l'annulation native du
document (Ctrl+Z / Cmd+Z).

### Exemple de code accepté

```python
import grist
from functions import *
import datetime, math, re

@grist.UserTable
class INFOS_BENEVOLES:
  Dispo_Mardi22 = grist.Choice()

  @grist.formulaType(grist.Text())
  def Nom_de_famille(rec, table):
    return ''

  @grist.formulaType(grist.Reference('INFOS_BENEVOLES'))
  def FormPlus_src_INFOS_BENEVOLES_Prenom(rec, table):
    return 0
```

Un même collé peut contenir plusieurs blocs `@grist.UserTable` / `class ... :` : le
widget vous laisse alors choisir la table à importer.

### Correspondance des types

Cette table sert dans les deux sens : à l'import, pour choisir le type de colonne créé ;
à l'export, pour écrire l'expression correspondant au vrai type de la colonne (voir
« Export » plus bas).

| Écrit dans le code                    | Type de colonne Grist |
|----------------------------------------|----------------------------------|
| `grist.Text()`                         | Texte                            |
| `grist.Numeric()`                      | Numérique                        |
| `grist.Int()`                          | Entier                           |
| `grist.Bool()`                         | Case à cocher                    |
| `grist.Date()`                         | Date                             |
| `grist.DateTime('Fuseau')`             | Date et heure (fuseau donné, sinon `UTC` par défaut) |
| `grist.Choice()`                       | Choix (liste déroulante)         |
| `grist.ChoiceList()`                   | Choix multiples                  |
| `grist.Reference('Autre_Table')`       | Référence vers `Autre_Table`     |
| `grist.ReferenceList('Autre_Table')`   | Références vers `Autre_Table` (liste) |
| `grist.Attachments()`                  | Pièces jointes                   |
| tout le reste / type non reconnu       | Quelconque (`Any`)               |

Par défaut, toutes les colonnes sont créées comme colonnes de données, y compris celles
écrites avec `@grist.formulaType(...)` dans le code source, et sans formule. Ce que
l'import ne reprend pas n'est pas perdu en silence : une remarque de l'aperçu liste les
colonnes calculées (formule, ou formule de déclenchement `def _default_...`), créées
vides, et les références bidirectionnelles qui ne peuvent pas être reliées (voir
ci-dessous), créées comme références simples.

#### Références bidirectionnelles

Deux colonnes qui se désignent l'une l'autre (`reverse_of='Autre'` des deux côtés, comme
l'écrit la vraie Code View) et sont créées **ensemble** — deux tables du même collé, ou
deux colonnes ajoutées à la même table existante — sont reliées par Grist (leur
« colonne réciproque »), et leurs valeurs restent synchronisées. L'aperçu les marque
« bidirectionnelle ». Une colonne dont la réciproque n'est pas créée en même temps
(décochée, absente du texte, ou déjà présente dans le document) reste une référence simple,
avec une remarque : relier une colonne existante réécrirait ses valeurs, ce que ce widget
ne fait jamais. Si Grist refuse de relier une paire (version sans références
bidirectionnelles, par exemple), les tables et leurs descriptions restent et le message de
fin le dit.

#### Choisir les éléments à importer

Le type de chaque colonne est toujours importé. Le groupe **Éléments à importer**, sous
l'aperçu, laisse choisir d'un coup ce que le texte apporte en plus :

| Élément                             | Ce que le texte en dit                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| **Libellés**                        | `label='...'`, quand il diffère de l'identifiant                                |
| **Descriptions des colonnes**       | `description='...'`                                                             |
| **Descriptions des tables**         | la chaîne qui ouvre la classe de la table (voir « Métadonnées capturées »)      |
| **Listes de choix**                 | `choices=[...]` et le style de chaque choix                                     |
| **Format des cellules**             | le reste de `widget_options` : alignement, formats de nombre et de date, couleurs… |
| **Colonne affichée des références** | `visible_col='...'` : la colonne de la table liée que montre la cellule d'une référence |
| **Liens bidirectionnels**           | `reverse_of='...'`                                                              |
| **Formules**                        | colonnes de formule et formules de déclenchement                                |

Chaque élément dit, sous son nom, ce qu'il est : « Format des cellules » et « Colonne affichée
des références » sont les noms de ce que Grist range dans les options d'une colonne
(`widgetOptions`) et dans son réglage « colonne à afficher ».

Seuls les éléments que le texte contient réellement sont proposés, chacun avec le nombre
de colonnes qui le portent (de tables, pour les descriptions de tables) ; quand il n'en
contient aucun, le groupe n'apparaît pas. Ces nombres suivent l'aperçu : ne comptent que ce
qui sera créé (tables cochées, colonnes cochées, colonnes absentes de la table existante ; la
description d'une table qui reçoit des colonnes n'est jamais proposée : une table existante
n'est jamais modifiée). Tout est coché par défaut, sauf
**Formules** (voir ci-dessous), et les cases reviennent à cet état à chaque analyse. Un
élément décoché est laissé de côté à la création, comme si le texte ne le contenait pas :
sans **Liens bidirectionnels**, deux colonnes qui se désignent restent deux références
simples ; sans **Libellés**, chaque colonne garde le libellé que Grist déduit de son
identifiant. Seules les formules laissent une remarque dans l'aperçu (les colonnes créées
vides), puisqu'elles sont décochées sans que vous l'ayez demandé.

#### Reprendre les formules

Cocher **Formules** crée les colonnes de formule avec leur formule, et les colonnes de
données avec leur formule de déclenchement (`def _default_...`, valeur calculée à la
création d'une ligne). Le texte de la fonction est lu tel qu'écrit : un `return X` seul
devient la formule `X`, les fonctions de plusieurs lignes restent telles quelles, et la
valeur que rend une formule vide (`return None`, `return ''`...) donne une colonne sans
formule, comme dans Grist ; **Formules** n'est proposé que s'il y a une formule non vide
à reprendre. La syntaxe `$Colonne` (écrite par l'onglet **Export**) et
`rec.Colonne` (écrite par la vraie Code View) sont toutes deux valides pour Grist.

Une chaîne qui s'étend sur plusieurs lignes (guillemets triples, antislash en fin de ligne,
littéraux accolés entre parenthèses) garde son texte. Grist écrit ses lignes telles quelles
depuis la 1.7.20 et les indente avec le code avant : le widget lit les deux, d'après les
fixtures de `test/fixtures/code-view/strings-*.py` et 400 formules tirées au hasard dans le
Code View de chaque version. Un seul cas est indécidable à la lecture : quand **toutes** les
lignes de la chaîne sont au moins aussi indentées que le code, le texte ne dit pas de quelle
version il vient et il est lu comme celui d'une version antérieure à 1.7.20 ; collé depuis
une version plus récente, il perd alors l'indentation du code (4 espaces) en tête de ces
lignes (26 formules sur 400 dans le tirage, qui en indente beaucoup). L'onglet **Export**
écrit toujours un texte que cette règle relit exactement.

**Formules** est **décoché par défaut, volontairement** : une formule est du code Python que
Grist exécute dans ce document dès sa création, et un texte collé peut venir de
n'importe où. Le widget n'exécute lui-même jamais rien (voir SECURITY.md) ; en le cochant,
vous confiez ces formules à Grist, comme si vous les aviez saisies dans les
cellules. Une formule qui renvoie une erreur (colonne absente de la nouvelle table, par
exemple) ne fait pas échouer l'import : ses cellules affichent l'erreur dans Grist.

### Métadonnées de colonne restaurées à l'import

En plus du type, l'import restaure — quand ils sont présents dans le texte collé sous
la forme des arguments nommés supplémentaires décrits plus bas (« Métadonnées
capturées à l'export ») — le libellé (`label`), la description, la liste de choix et
son style (couleurs, gras...) pour Choix/Choix multiples, et le reste des options
d'affichage de la colonne (`widgetOptions` : alignement, retour à la ligne, format
numérique/date, etc.). Grist ignore la description quand on crée une colonne : le
widget l'applique juste après, dans une seconde étape. Un identifiant qui n'est pas celui
que Grist déduirait du libellé (`Name` pour le libellé « Nom ») est resté indépendant de
lui dans le document d'origine : l'import le fait de même, pour qu'une modification
ultérieure du libellé ne renomme pas la colonne. Un texte Code View réel, issu
directement de Grist (sans ces arguments), ne donne que les types. Chacune de ces
métadonnées est un élément que le groupe **Éléments à importer** laisse décocher (voir
« Choisir les éléments à importer »).

### Limites connues

- Les valeurs d'une liste de choix ne sont reprises que si elles apparaissent
  explicitement dans le code sous la forme `choices=['A', 'B']`. Un texte collé depuis
  la vraie Code View de Grist (qui n'expose pas ces valeurs) ne les contient pas ; un
  texte généré par l'onglet **Export** de ce même widget, si.
- Pour une colonne de référence, la « colonne d'affichage » (visible column) est
  restaurée quand le texte précise `visible_col='NomDeColonne'` et que cette colonne
  existe dans la table cible, déjà présente ou créée dans le même lot. Introuvable, elle
  est signalée dans le message de fin, sans faire échouer la création.
- Si une colonne référence une table qui n'existe pas dans le document de destination
  (et n'est pas créée en même temps), elle est importée en type `Any` avec un
  avertissement dans l'aperçu.
- Les arguments de constructeur complexes (expressions, appels imbriqués) ne sont pas
  interprétés ; seuls le premier argument texte (table cible, fuseau horaire) et les
  arguments nommés `choices=`, `widget_options=`, `label=`, `description=`, `visible_col=`
  et `reverse_of=` sont lus — le reste est ignoré sans faire échouer l'import de la colonne.
- Un appel dont les parenthèses ne sont pas refermées, ou une valeur texte qui s'étend sur
  plusieurs lignes dans un texte écrit à la main, est ignoré comme contenu non reconnu,
  avec un avertissement. Le texte généré par l'onglet **Export** n'a jamais ce défaut :
  les retours à la ligne y sont écrits `\n`.
- Grist réécrit certains identifiants de colonne (`_x` devient `x`, `class` devient
  `cclass`) : le widget suit l'identifiant réellement créé. Une colonne nommée `grist`
  fait en revanche échouer Grist lui-même (le code généré du document masque alors son
  propre module `grist`) : l'erreur est affichée et rien n'est créé.
- Une formule de déclenchement est reprise comme formule des nouvelles lignes : les
  réglages « recalculer quand… » (`recalcWhen`, `recalcDeps`) ne figurent pas dans la Code
  View et ne sont pas repris. Une formule qui s'appuie sur une colonne ou une table absente
  du document de destination est créée telle quelle, et Grist en affiche l'erreur.
- Le widget copie la **structure** d'une table : ni les données, ni les droits d'accès, ni
  les vues et widgets de la page (ni leurs titres et descriptions), ni les tables de
  synthèse ne sont repris ou proposés. La description de la table elle-même l'est, pour les
  tables que l'import crée ; celle d'une table qui reçoit des colonnes n'est jamais modifiée.
- **Versions de Grist** : la suite complète (`npm run test:grist`, plus de 300 tests) passe
  sur Grist 1.2.1 (octobre 2024), 1.6.1, 1.7.1, 1.7.20 et une version de développement du
  1er octobre 2026. Avant 1.2, le moteur ne connaît pas les références bidirectionnelles
  (essayé sur 1.1.10 : le widget le dit dans le message de fin et crée des références
  simples) ; avant 1.1, il n'a pas de description de colonne (1.0.5). Ces versions ne sont
  pas couvertes par la suite complète.

## Export

1. Ouvrez l'onglet **Export**. La liste des tables de ce document se charge
   automatiquement (bouton **Actualiser la liste** pour la relire, sans perdre les tables
   déjà cochées).
2. Cochez une ou plusieurs tables (la case **Tout cocher** les sélectionne toutes). Un champ
   de recherche, au-dessus de la liste, filtre les tables au fil de la frappe (sans tenir
   compte des majuscules, des accents ni de l'ordre des mots) : les tables cochées que la
   recherche masque restent cochées, et exportées, ce que le champ rappelle ; la case du
   dessus (**Cocher les tables affichées**) n'agit alors que sur celles qui le sont, et
   **Échap** efface la recherche. Sous la liste, le groupe **Éléments à exporter** liste ce
   que ces tables contiennent au-delà du type de leurs colonnes (libellés, descriptions des
   colonnes et des tables, listes de choix, format des cellules, colonne affichée des
   références, liens bidirectionnels, formules), avec le nombre de colonnes (ou de tables)
   concernées et, sous chaque nom, ce qu'il est. Tout est coché par défaut : décochez ce que
   le code ne doit pas contenir (le type de chaque colonne est toujours exporté). Cliquez
   ensuite sur **Générer le code**.
3. Copiez le code affiché (bouton **Copier**, ou sélection manuelle du texte) et
   collez-le où vous en avez besoin — par exemple dans l'onglet **Import** de ce même
   widget, ouvert sur un autre document.

Le format généré suit celui de la vraie « Code View » de Grist : mêmes lignes
d'import en en-tête, mêmes expressions `grist.Xxx(...)`, même ordre (colonnes de données
d'abord, puis colonnes de formule), mêmes lignes vides. Les tables système de Grist
(`_grist_*`) et les tables de synthèse (créées par un widget Synthèse/Pivot) ne sont pas
proposées : ce ne sont pas des tables qu'on recrée avec une simple action « nouvelle
table ».

Seule la structure (types de colonnes) est garantie fidèle. Pour une colonne de formule
(et pour la formule de déclenchement d'une colonne de données, écrite comme la fait
Grist, par une fonction `_default_...` placée avant la colonne), la formule d'origine est
recopiée quand elle existe, mais telle que Grist la stocke en interne (syntaxe
`$Colonne`, sans traduire vers le `rec.Colonne` affiché par la vraie Code View) ; une
formule vide est remplacée par la valeur par défaut du type, comme le fait Grist
lui-même. À l'import, ces formules ne sont reprises que si **Formules** est coché dans le
groupe **Éléments à importer** ; sinon seul le type déclaré compte. Décocher **Formules** à
l'export écrit ces colonnes comme des colonnes de données, sans formule : le type seul
voyage.

### Métadonnées capturées à l'export

Au-delà du type de chaque colonne, l'export capture et restitue le plus possible de sa
configuration réelle, pour que l'import qui suit la restaure fidèlement — en particulier
les choix définis (liste et style par choix), qui sont le cas le plus courant. Ceci est
fait en ajoutant, sur la même ligne que chaque `grist.Xxx(...)`, des arguments nommés
supplémentaires, tous optionnels, chacun étant un élément que le groupe **Éléments à
exporter** laisse décocher (les formules en forment un de plus) :

- **`choices=[...]`** (**Listes de choix**) : la liste des valeurs d'un Choix/Choix
  multiples.
- **`widget_options='<JSON>'`** (**Format des cellules**, et pour le style par choix
  **Listes de choix**) : le reste des options d'affichage de la colonne
  (`widgetOptions`, tel que Grist les stocke), sous forme d'un objet JSON — notamment le
  style par choix (`choiceOptions` : couleur de texte/fond, gras...), l'alignement, le
  retour à la ligne, le format numérique ou de date, et toute autre option générique
  rencontrée. Quelques clés sont volontairement exclues ou réduites (styles de mise en
  forme conditionnelle, formule compilée d'une condition de liste déroulante) : voir
  SECURITY.md pour le détail et la justification de chacune. Absent entièrement si la
  colonne n'a aucune option à en dehors des choix.
- **`label='...'`** (**Libellés**) : le libellé affiché de la colonne, uniquement s'il
  diffère de son identifiant (Grist les fait correspondre par défaut).
- **`description='...'`** (**Descriptions des colonnes**) : la description de la colonne,
  si elle est renseignée.
- **`visible_col='NomDeColonne'`** (**Colonne affichée des références**) : pour une colonne
  de référence, l'identifiant (pas
  l'identifiant technique interne, propre au document et sans signification ailleurs) de
  la colonne de la table cible utilisée comme « colonne d'affichage ».

Une référence bidirectionnelle est écrite, comme le fait la vraie Code View, avec
**`reverse_of='NomDeColonne'`** (la colonne réciproque, dans la table cible ; élément
**Liens bidirectionnels**) : ce n'est pas une extension de ce widget.

La description d'une **table** (celle de son widget « Données brutes », où Grist la garde)
s'écrit comme la docstring de sa classe, une chaîne sur une seule ligne comme celle de
`description=` (élément **Descriptions des tables**) :

```python
@grist.UserTable
class Clients:
  'Les clients de l’association'
  Nom = grist.Text()
```

À l'import, la chaîne qui ouvre la classe est la description de la table, écrite une fois la
table créée ; une chaîne placée ailleurs, ou sur plusieurs lignes entre guillemets triples,
n'est pas lue (remarque « contenu non reconnu »). Seule la description de la table est
reprise : celles des autres widgets (vues, pages) ne font pas partie de sa structure.

**Ce sont des arguments propres à ce widget, pas le format officiel de la Code View de
Grist** : Grist lui-même n'écrit, au mieux, que `choices=[...]` dans de rares cas, jamais
les autres. Un texte Code View authentique, collé depuis Grist sans ces arguments, ne
donne que les types — ces arguments sont une extension strictement additive du format,
reconnue par l'onglet **Import** de ce même widget. Voir SECURITY.md pour comment ce texte supplémentaire est
analysé (toujours par simple lecture de texte, jamais exécuté) et « Limites connues »
ci-dessus pour les cas non couverts.

### Tables référencées non sélectionnées

Si les tables cochées contiennent une colonne de référence (simple ou liste) vers une
table de ce document qui n'est elle-même pas cochée, un bandeau d'information apparaît
au-dessus de la liste, énumérant la ou les tables concernées et la colonne qui pointe
vers chacune. Deux choix, tous deux non bloquants (le bouton **Générer le code** reste
utilisable dans tous les cas) :

- **Inclure ces tables** : coche-les automatiquement (et peut faire réapparaître le
  bandeau si l'une d'elles référence à son tour une autre table non cochée) ;
- **Continuer sans elles** : masque le bandeau pour cette situation précise ; il
  réapparaît si la sélection change de façon à produire un ensemble différent de tables
  manquantes.

Générer le code sans inclure une table référencée n'est pas une erreur : la colonne de
référence correspondante s'importera simplement en type `Any` dans le document de
destination si la table cible n'y existe pas non plus, avec un avertissement affiché
dans l'aperçu de l'onglet **Import** (voir « Limites connues » ci-dessus) — exactement
comme pour toute référence vers une table absente.

## Identité visuelle (Grist Factory)

L'interface suit l'identité UI/UX commune aux widgets **Grist Factory** (grist-factory.fr) :

- **Palette** : une base neutre (fond/surface/bordures/texte en plusieurs intensités) et
  un seul bleu d'accent (`#2f6fed`) pour les actions et états actifs ; rouge pour les
  erreurs, ambre pour les remarques de l'analyse, vert pour les confirmations — jamais de
  couleur sans rôle sémantique. Coins arrondis partout (7 px / 11 px), ombres douces
  réservées aux éléments flottants (le panneau Réglages) et très légères sur les cartes.
- **Accessibilité** : quatre valeurs de la charte (texte discret, rouge et vert des
  messages, bleu des petits textes) sont légèrement assombries pour atteindre 4,5:1 (WCAG
  AA, RGAA 3.2) là où elles donnaient 3,7 à 4,4, et les champs ont un contour à 3:1 ;
  `test/style.test.mjs` mesure ces contrastes dans les deux thèmes. Les zones cliquables
  font au moins 24 px, le focus reste visible et revient au bouton qu'on vient d'actionner,
ou au champ de texte quand il n'y a plus rien à actionner (table créée, colonnes ajoutées), les
  champs, groupes et résultats ont un nom accessible et les fins d'analyse sont annoncées,
  l'onglet sélectionné reste repérable en mode contraste élevé (`forced-colors`), la page
  a un repère `main` et un titre par étape, et les onglets répondent aux flèches, à
  Début et à Fin. Vérifié dans Chromium à chaque lancement de `npm run test:browser` par
  axe-core (WCAG 2.2 A et AA, bonnes pratiques : aucune violation sur les cinq écrans
  principaux, thèmes clair et sombre, français et anglais) et par des contrôles de
  clavier, de taille et de nom accessible ; pas encore passé au lecteur d'écran.
- **Typographie** : **Manrope** (police variable) pour toute l'interface, vendorisée
  dans `fonts/manrope/` (police variable réduite à l'alphabet latin, 28 Ko, licence SIL
  Open Font License jointe) plutôt que chargée depuis une CDN — voir SECURITY.md. Le code Python (collé ou généré) reste
  en police à chasse fixe, monospace, inchangé.
- **Thème système / clair / sombre** : réglable dans le panneau Réglages (icône en haut
  à droite), mémorisé sur cet appareil. « Système » (par défaut) suit le thème du
  système d'exploitation.
- **Icônes** : deux SVG en contour, en ligne dans `index.html`, aucune police d'icônes
  ni emoji (voir SECURITY.md).
- **Bilingue français / anglais** : réglable dans le même panneau. Toute chaîne visible
  de l'interface est traduite (`js/i18n.js`, dont un test vérifie que les deux langues
  ont les mêmes clés, formes plurielles et paramètres) — aussi bien les libellés fixes (titres,
  boutons, en-têtes, aide) que les messages générés dynamiquement pendant l'usage
  (statuts de création/ajout, avertissements d'analyse), accords singulier/pluriel
  compris (ex. « Table « X » créée avec 1 colonne. » / « ... avec 3 colonnes. »).
- **Logo** : celui de Grist Factory, affiché discrètement juste à droite du bouton
  Réglages (`assets/grist-factory-logo.jpg`).
- **Crédits** (panneau Réglages) : Grist Factory, site, licence.

## Installation (hébergement GitHub Pages)

1. Dans les paramètres du dépôt, activez **Pages** en choisissant la source
   « GitHub Actions » (le workflow `.github/workflows/pages.yml` fourni construit et
   publie automatiquement le site à chaque envoi sur `main`).
2. Une fois publié, l'URL du widget est celle indiquée par GitHub Pages, avec
   `index.html` à la racine (par ex. `https://<compte>.github.io/<depot>/`).
3. Dans un document Grist, ajoutez un widget **Personnalisé** (Custom) et collez cette
   URL. Grist demandera d'accorder l'accès complet au document (nécessaire pour créer
   une table) : c'est attendu, voir [SECURITY.md](./SECURITY.md).

### Hébergement en réseau fermé / auto-hébergé

Le widget charge l'API officielle de Grist depuis `https://docs.getgrist.com/grist-plugin-api.js`
(voir [SECURITY.md](./SECURITY.md) pour la justification). Si votre Grist est
auto-hébergé sur un réseau sans accès à ce domaine, votre instance Grist sert déjà ce
même fichier à sa propre racine (`<votre-grist>/grist-plugin-api.js`) : changez
simplement la balise `<script src="...">` dans `index.html` (et l'origine correspondante
dans la directive `script-src` de la CSP) pour pointer vers votre propre instance avant
de publier ce dépôt sur votre propre hébergement statique.

## Développement

Le widget est du HTML/CSS/JS statique sans dépendance d'exécution (modules ES natifs,
aucun paquet npm requis pour le faire tourner). Code, commentaires et titres de tests en
anglais ; documentation et messages de commit en français.

Trois suites de tests :

```sh
npm test               # unitaires (node --test, aucune installation) : parseur,
                       # génération, types, i18n et typographie, contrastes, lint de sécurité,
                       # actions épinglées, site publié, vrai Code View enregistré
npm run test:browser   # le vrai index.html dans Chromium (Playwright), faux `grist` en mémoire
npm run test:grist     # le widget contre une vraie instance Grist (voir ci-dessous)
```

`npm test` suffit pour la logique : il n'a besoin ni de navigateur ni de Grist. Le test de
sécurité (`test/security.test.mjs`) y interdit dans `js/` `eval`, le constructeur `Function`,
`innerHTML`/`outerHTML`, `document.write`, `import()`, `fetch`, `WebSocket`..., et vérifie
que `index.html` ne charge que l'API officielle de Grist et sa CSP.

Playwright (et axe-core, qui y vérifie l'accessibilité), seules dépendances du dépôt
(`devDependencies`, jamais publiées avec le widget), servent aux deux autres suites :

```sh
npm ci
npx playwright install chromium
```

### Tests sur une instance Grist réelle

`npm run test:grist` pilote une vraie instance Grist par son API REST (qui expose la même
chose que l'API d'un widget : `listTables`, `fetchTable`, `applyUserActions` avec ses
`retValues`). Il vérifie ce que le widget attend du moteur (normalisation des identifiants,
description ignorée à la création, lot atomique...), l'aller-retour Export → Import de
chaque type de colonne avec toutes ses options (avec et sans formules, références
bidirectionnelles comprises), chaque élément laissé de côté à l'export puis à l'import (le
même document des deux côtés), les identifiants contre le moteur (tables, et colonnes
déduites de leur libellé), la logique d'import, l'interface complète pilotée dans
Chromium, et le widget monté comme widget personnalisé dans la vraie page de Grist
(iframe, vrai script d'API, vraie autorisation d'accès). Pour en lancer une :

```sh
docker run -d -p 8484:8484 -e APP_HOME_URL=http://localhost:8484 \
  -e GRIST_DEFAULT_EMAIL=ci@example.com -e GRIST_IN_SERVICE=true \
  -e GRIST_SANDBOX_FLAVOR=unsandboxed gristlabs/grist:1.7.20
GRIST_URL=http://localhost:8484 npm run test:grist   # GRIST_URL est ce défaut
```

Grist n'accepte que le nom d'hôte de `APP_HOME_URL` (`localhost`, pas `127.0.0.1`). La CI
exécute la même suite sur trois versions de Grist (1.2.1, 1.7.20 et une version de
développement), images épinglées par digest : pour en changer, `docker pull`, puis reporter
le digest affiché dans `.github/workflows/ci.yml`. Si Chromium n'est pas à
l'emplacement attendu par Playwright, `PLAYWRIGHT_CHROMIUM_PATH` indique l'exécutable.

Les fixtures de `test/fixtures/code-view/` sont du texte Code View produit par le
`gencode.py` d'un vrai Grist, dont `strings-1.2.1.py` et `strings-1.7.20.py`, les deux
façons d'écrire les chaînes sur plusieurs lignes ; elles se régénèrent avec
`test/grist/record-code-view.mjs` (`GRIST_SANDBOX_DIR=<grist-core>/sandbox/grist`,
`GRIST_PYTHON`, `GRIST_VERSION` ; l'argument `strings` n'enregistre que celle de la version
visée). Sans
sources de grist-core, `GRIST_PYTHON` peut être un petit script qui lance `python3` dans le
conteneur (`docker cp test/grist/code_view.py <conteneur>:/tmp/`, puis
`exec docker exec -i -e GRIST_SANDBOX_DIR=/grist/sandbox/grist <conteneur> python3 /tmp/code_view.py`).

Structure :

```
index.html             page du widget (en-tête, panneau Réglages, onglets Import / Export)
style.css              mise en forme (identité visuelle Grist Factory, thème clair/sombre)
fonts/manrope/         police Manrope vendorisée et son fichier d'origine (voir SECURITY.md)
assets/                logo Grist Factory (voir SECURITY.md)
js/theme-init.js       applique le thème et la langue mémorisés avant le premier affichage
                       (et masque la page française d'un lecteur de l'anglais jusqu'à sa traduction)
js/app.js              point d'entrée : onglets, initialisation
js/importTab.js        onglet Import : câblage du DOM
js/importer.js         logique de l'import sans DOM : résolution des colonnes, identifiants,
                       formules, création en un lot, puis détails et références bidirectionnelles
js/exportTab.js        onglet Export
js/search.js           recherche dans une liste : mots, casse et accents ignorés
js/elements.js         éléments d'une colonne (libellés, choix, formules...) : comptes et retrait, pour Import et Export
js/elementsPicker.js   le groupe de cases à cocher de ces éléments (DOM), commun aux deux onglets
js/parser.js           lecture du code source (motifs fixes + scanner de parenthèses, jamais exécuté)
js/pyText.js           texte Python : littéraux, chaînes sur plusieurs lignes, parenthèse fermante, arguments
js/gristTypes.js       types de colonne <-> constructeurs Code View (une table de types)
js/widgetOptions.js    ce qui d'un widgetOptions peut voyager d'un document à l'autre
js/schema.js           structure réelle du document (_grist_Tables*), tables référencées
js/codeGenerator.js    génère le code Python (types, métadonnées, formules, références bidirectionnelles)
js/dom.js              construction du DOM sans innerHTML
js/i18n.js             dictionnaire fr/en + liaison data-i18n
js/settings.js         panneau Réglages (thème, langue)
js/storage.js          préférences mémorisées (localStorage, tolérant au blocage)
js/util.js             délai d'attente des appels Grist, texte des erreurs
test/*.test.mjs        tests unitaires ; test/fixtures/ : vrai Code View enregistré
test/browser/          interface dans Chromium (faux grist en mémoire)
test/grist/            tests contre une vraie instance Grist
```

## Sécurité

Voir [SECURITY.md](./SECURITY.md) pour le modèle de menace, la politique de dépendances,
la Content-Security-Policy appliquée et la manière de vérifier vous-même ces propriétés
(utile en amont d'un audit de sécurité).

## Licence

[GNU GPL v3.0](./LICENSE).
