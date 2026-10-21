# Marchéa

Prototype francophone de marketplace : catalogue filtrable, recherche, panier et ajout de produits par des vendeurs. Interface responsive, sans dépendance npm.

## Démarrage

Node.js 20 ou plus. Depuis `/workspace/projet` :

```sh
npm start
```

Le serveur écoute sur le port 3000 (surcharge possible avec `PORT`). Vérification : `npm test`.

## Portée

Les produits ajoutés et le panier sont conservés dans le stockage local du navigateur. Ce prototype ne possède pas de serveur de données, de comptes, de paiement, d'abonnement actif, de livraison ni de gestion de commandes. Les produits initiaux sont fictifs et les photos illustratives. L'offre vendeur à 19 €/mois est indicative. Les photos Unsplash et polices Google nécessitent une connexion externe ; les polices système prennent le relais.

Pour une marketplace en production : définir le pays et la devise, intégrer l'authentification et une base de données, puis un prestataire adapté aux marketplaces pour l'abonnement vendeur, les paiements et les reversements. Ne pas collecter de données bancaires dans ce prototype.

## Photos des produits

Le formulaire vendeur accepte une photo JPG, PNG ou WebP de 5 Mo maximum, avec aperçu et retrait avant ajout. Elle est convertie localement en JPEG de 800 pixels maximum pour limiter le stockage. Les photos sont conservées avec les produits dans le navigateur et réapparaissent après rechargement. Elles ne sont pas publiées en ligne. Si le stockage est plein, un message indique que le produit reste disponible uniquement pour la session.

Les produits ajoutés localement disposent d’un bouton « Supprimer mon produit » avec confirmation. La suppression retire aussi le produit du panier local. Les produits de démonstration ne disposent pas de ce bouton.

Cliquer sur la photo d’un produit ouvre une fiche détaillée accessible au clavier : photo, nom, boutique, catégorie, description, prix et ajout au panier. Fermer avec la croix ou Échap.
