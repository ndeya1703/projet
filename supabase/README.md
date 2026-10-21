# Activer les comptes clients Supabase

Le code est prêt à être raccordé, mais aucun service Supabase n'est créé automatiquement. Tant que `account-config.mjs` est vide, le site n'accepte aucune inscription et garde son panier invité local.

## Configuration dans votre compte

1. Ouvrir https://supabase.com/dashboard, créer un projet dans votre organisation et choisir une région adaptée. Le mot de passe de base de données reste privé : ne pas le transmettre dans le chat, le navigateur de la boutique ou GitHub.
2. Dans **SQL Editor**, ouvrir une nouvelle requête, copier tout le contenu de [`setup.sql`](./setup.sql) et exécuter **Run**. Le script est réexécutable. Il crée `customer_carts`, active les règles de sécurité RLS et réserve chaque ligne à son propriétaire authentifié. Il n'ouvre aucun accès aux visiteurs anonymes.
3. Dans **Authentication → URL Configuration**, définir **Site URL** sur `https://ndeya1703.github.io/projet/` et ajouter cette même URL aux redirections autorisées. Garder la confirmation des adresses e-mail activée. Le client n'ouvre pas de session tant que l'adresse n'est pas confirmée ; le client confirme son adresse puis se connecte depuis la boutique.
4. Dans les réglages du projet, récupérer **Project URL** et, dans **API Keys**, la clé **Publishable** (`sb_publishable_…`). Une ancienne clé publique `anon` est aussi compatible. Ne jamais utiliser une clé `sb_secret_…`, `service_role`, un jeton de gestion Supabase ou le mot de passe de base de données.
5. Renseigner seulement ces deux valeurs publiques dans `account-config.mjs` :

   ```js
   export const accountConfig = {
     url: 'https://VOTRE-REFERENCE.supabase.co',
     publishableKey: 'VOTRE_CLE_PUBLIQUE_PUBLISHABLE',
   };
   ```

6. Envoyer ce fichier sur GitHub, puis attendre le déploiement Pages et actualiser la boutique. Aucun serveur Node n'est requis pour l'hébergement de la boutique : les appels HTTPS vont directement au service Supabase, qui vérifie l'utilisateur et les politiques RLS.

Les réglages d'envoi d'e-mails de Supabase peuvent limiter les destinataires et le volume dans un nouveau projet. Si la confirmation ne parvient pas au client, inspecter les journaux Authentication et les réglages d'e-mail du projet ; configurer un service SMTP pour un usage public si nécessaire. Ne pas désactiver la confirmation pour contourner une erreur d'envoi.

## Validation réelle à effectuer après connexion du projet

- Créer deux comptes de test avec des adresses distinctes, confirmer leurs e-mails et se connecter.
- Ajouter un produit avec le compte A. Se déconnecter puis se reconnecter depuis un autre navigateur : le panier A doit réapparaître.
- Se connecter au compte B : le panier A ne doit jamais apparaître. Vérifier aussi qu'une requête authentifiée de B ciblant la ligne de A ne peut ni la lire ni la modifier. Un visiteur anonyme ne doit avoir aucun droit sur la table.
- Retirer un produit puis se reconnecter pour confirmer la persistance du retrait.
- Couper temporairement la connexion : un échec de synchronisation doit être visible et le bouton de réessai doit enregistrer les changements après rétablissement de la connexion.

Ces vérifications n'ont pas été exécutées contre un projet réel tant que ses paramètres publics ne sont pas fournis et que le SQL n'est pas appliqué. Les tests automatisés utilisent un service simulé ; ils ne prouvent pas la configuration RLS d'un projet distant.

## Données et limites

Supabase Auth gère les mots de passe. Le site ne conserve jamais les mots de passe. Le jeton de renouvellement est conservé dans `sessionStorage` pour l'onglet courant ; le jeton d'accès reste en mémoire. Fermer l'onglet implique généralement une nouvelle connexion. La déconnexion efface la sélection de l'appareil et les jetons locaux.

Le panier invité est fusionné avec le panier du compte lors de la connexion, en conservant la quantité la plus élevée pour un même article, sans doubler les quantités. Le panier est ensuite sauvegardé en ligne. Il contient des copies des produits de démonstration et des photos sélectionnées, pour les afficher sur un autre appareil. Cela ne publie pas les produits vendeurs dans un catalogue partagé. Maximum : 100 références et environ 2 Mo par panier. En cas d'échec réseau, le site le signale et permet un nouvel essai ; des changements non synchronisés peuvent être perdus à la fermeture de la page. Entre deux appareils modifiant simultanément un panier, la dernière sauvegarde l'emporte ; actualiser/reconnecter pour relire les modifications de l'autre appareil.

Les noms, photos et prix enregistrés dans le panier sont des données de démonstration contrôlables par le client. Ils ne doivent jamais servir de référence pour facturer. Les paiements, commandes et produits vendeurs publics ne sont pas implémentés.

## Diagnostic des confirmations

Dans « Mon compte », le bouton de vérification effectue seulement une lecture des paramètres publics Supabase : il ne crée pas de compte et n’envoie pas d’e-mail. Une erreur « Connexion impossible » signifie que le navigateur n’a pas pu terminer la requête ; vérifier avec un autre navigateur/réseau et inspecter les erreurs réseau si nécessaire. Le bouton de renvoi demande un nouveau lien après une inscription nécessitant une confirmation, sous réserve des limites Supabase.

Le service SMTP Supabase par défaut n’envoie qu’aux adresses des membres de l’équipe du projet. Pour les clients externes, configurer un SMTP personnalisé dans Authentication → Emails / SMTP Settings (Resend, Brevo ou autre fournisseur). Entrer les identifiants SMTP uniquement dans les paramètres sécurisés Supabase, jamais dans le site ni GitHub. Source : https://supabase.com/docs/guides/auth/auth-smtp.
