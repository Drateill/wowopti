# Conditions d'utilisation : Blizzard et Wowhead

Vérifié le 20 novembre 2026. Ce n'est pas un avis juridique.

## API Blizzard

Texte lu : « Blizzard Developer API Terms of Use », mis à jour le 1er octobre 2019. Il faut le revérifier de temps en temps (§10).

| Règle | Où | État dans l'app |
|---|---|---|
| Usage gratuit. Pas de fonction payante, pas de dons qui débloquent des fonctions, pas de pub vidéo obligatoire | §2.2 | ✅ Site gratuit, sans publicité |
| Pas de publicité ciblée avec les données, pas de revente | §2.8, §2.9 | ✅ Rien de tel |
| Données gardées 30 jours au plus. Supprimer un personnage qui n'existe plus ou dont le joueur le demande | §2.18, §11.3 | ✅ Cache mémoire de 5 min pour les profils et de 24 h pour les objets |
| Citer Blizzard comme source sans laisser croire à un partenariat. Pas de marque Blizzard dans le nom ou l'URL de l'app | §2.13, §4 | ✅ Pied de page ajouté. Le nom « Forever Theorycraft » et le domaine `wowopti` n'utilisent ni « World of Warcraft » ni « Blizzard ». À voir : « WoW » dans `wowopti` |
| Politique de confidentialité publiée, données fournies « en l'état », aucun mot de passe collecté | §2.15 | ✅ Section « Confidentialité » dans le pied de page |
| 36 000 appels par heure au maximum | §2.17 | ✅ Plafond global à 30 000 par heure, et le quota est suivi dans Grafana |
| Clé confidentielle. Prévenir Blizzard sous 24 h en cas de fuite | §2.12, §2.14 | ✅ Secret Kubernetes, jamais dans Git ni dans l'image |
| Coordonnées d'inscription de l'app à jour | §2.1 | À vérifier par toi sur develop.battle.net |

**Conclusion :** l'usage de l'API Blizzard est conforme.

## Wowhead (ZAM Network)

Texte lu : contrat ZAM « EULA and Terms of Service », mis à jour le 14 mai 2025 (lien « Terms of Use » en bas de wowhead.com, vers corp.fanbyte.com/legal/terms). Ce texte s'applique à www.wowhead.com.

Ce qu'il dit :

- **Robots :** interdit d'accéder au site, d'y chercher ou d'en télécharger du contenu avec un robot, un crawler ou un outil d'extraction de données. Seuls les navigateurs web courants et les outils fournis par ZAM sont permis.
- **Copie :** interdit de reproduire, distribuer ou redistribuer le service. Les données, la compilation et les contenus appartiennent à ZAM ou à ses concédants.
- **Licence :** la licence accordée est personnelle et non commerciale.
- **Affichage :** interdit d'afficher, copier en miroir ou intégrer en cadre un élément du service sans accord écrit.

Le fichier robots.txt de wowhead.com interdit aussi `/forever/search` (et `/search`) à tous les robots.

| Usage dans l'app | Risque | Alternative conforme |
|---|---|---|
| `scripts/fetch-forever.mjs` télécharge talents, sorts, infobulles et icônes (le lancement automatique du lundi est **retiré** ; le workflow ne se lance plus qu'à la main) | **Élevé** : extraction automatisée, puis redistribution dans un site public. Les données déjà téléchargées restent dans l'app | Demander une autorisation écrite à Wowhead/ZAM, ou repartir de sources sous licence ouverte (fichiers DBC/DB2 du client, données communautaires sous licence libre) |
| ~~Relais serveur `/wowhead/forever/search/suggestions-template` (recherche d'objets)~~ | **Réglé** : relais supprimé, la recherche et les suggestions passent par l'API Blizzard (`/data/wow/search/item`) | — |
| Infobulles et ensembles lus depuis le navigateur sur `nether.wowhead.com` (stats, blocage des boucliers, suffixes) | Moyen : c'est le navigateur du visiteur qui fait l'appel, mais le contenu est réutilisé dans l'app | Fiche d'objet de l'API Blizzard en premier (déjà le cas), Wowhead seulement en complément |
| Liens vers les pages Wowhead | Faible | Rien à changer |
| Icônes chargées depuis `wow.zamimg.com` | Faible à moyen : elles viennent de Blizzard, mais sont hébergées par ZAM | Icônes servies par l'API média de Blizzard (`/data/wow/media/item/...`), déjà utilisée à l'import |

**Conclusion :** le relais de la recherche est supprimé et le téléchargement n'est plus automatique. Reste à régler : les talents et sorts déjà extraits de Wowhead et publiés dans l'app, et les infobulles lues sur `nether.wowhead.com`. Tant que Wowhead n'a pas donné son accord, il vaut mieux ne pas faire connaître le site plus largement.

## wago.tools (tables du client WoW Forever)

Vérifié le 21 novembre 2026. wago.tools publie les tables de données du client (produit `wowf`). Son fichier robots.txt et sa page `/llms.txt` autorisent explicitement le téléchargement automatique des exports CSV (`/db2/{table}/csv`) et des routes `/api/` ; seules les pages HTML du navigateur de tables sont interdites aux robots. Le site n'affiche pas de conditions d'utilisation à part. Les données elles-mêmes appartiennent à Blizzard.

| Usage dans l'app | Risque | Remarque |
|---|---|---|
| `scripts/fetch-wago.mjs` (`npm run fetch-spells`) : sorts de dégâts de chaque classe (dégâts, coefficients, coût, durée…) écrits dans `src/data/generated/wago-spells.json`, lancé à la main | Faible : usage autorisé par wago.tools, une requête par table et par version | wago.tools cité dans le pied de page. Les corrections envoyées par le serveur (hotfixes) ne sont pas dans ces tables |

**Piste :** les mêmes tables contiennent aussi les talents (Talent, TalentTab) et les sorts déjà repris de Wowhead. Les en tirer permettrait de ne plus dépendre de Wowhead pour les données du simulateur.

