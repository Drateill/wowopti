# Forever Theorycraft

Outil de theorycraft pour **WoW Forever** : simulateur (DPS, soins, menace), poids de stats,
comparateur et optimiseur d'équipement, planificateur de talents, import de personnage.
Classes : démoniste, paladin, druide, mage, prêtre, chasseur, voleur, guerrier, chaman (toutes les spécialisations).

## Développement

```bash
npm install
cp .env.example .env.local   # clés de l'API Blizzard (facultatif)
npm run dev
```

- `npm test` : tests (Vitest)
- `npm run build && npm run build:server` puis `npm start` : version de production en local
- `npm run fetch-data` : met à jour talents et sorts depuis Wowhead Forever

## Déploiement (Kubernetes + ArgoCD)

À chaque push sur `main`, la CI (`.github/workflows/deploy.yml`) lance les tests, publie l'image
`ghcr.io/drateill/wowopti:<commit>` et met à jour `k8s/kustomization.yaml` ; ArgoCD synchronise.

Mise en place, une seule fois :

```bash
kubectl apply -f k8s/argocd-application.yaml
kubectl -n wowopti create secret generic wowopti-blizzard \
  --from-literal=BLIZZARD_CLIENT_ID=... --from-literal=BLIZZARD_CLIENT_SECRET=...
```

Le secret est facultatif : sans lui, l'app fonctionne avec les données Wowhead uniquement.

Données de jeu : Wowhead et l'API Blizzard. Vérifier leurs conditions d'utilisation avant une
diffusion publique.
