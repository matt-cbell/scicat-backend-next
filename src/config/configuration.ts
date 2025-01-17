import { Logger } from "@nestjs/common";

const configuration = () => {
  const accessGroupsStaticValues =
    process.env.ACCESS_GROUPS_STATIC_VALUES || ("" as string);
  const adminGroups = process.env.ADMIN_GROUPS || ("" as string);
  const deleteGroups = process.env.DELETE_GROUPS || ("" as string);
  const createDatasetGroups =
    process.env.CREATE_DATASET_GROUPS || ("all" as string);

  Logger.log("Config SETUP");
  Logger.log("- Access groups statisc values : " + accessGroupsStaticValues);
  Logger.log("- Admin groups : " + adminGroups);
  Logger.log("- Delete groups : " + deleteGroups);
  Logger.log("- Create dataset groups : " + createDatasetGroups);

  return {
    adminGroups: adminGroups.split(",").map((v) => v.trim()) ?? [],
    deleteGroups: deleteGroups.split(",").map((v) => v.trim()) ?? [],
    createDatasetGroups: createDatasetGroups.split(",").map((v) => v.trim()),
    logoutURL: process.env.LOGOUT_URL ?? "", // Example: http://localhost:3000/
    accessGroupsStaticValues:
      accessGroupsStaticValues.split(",").map((v) => v.trim()) ?? [],
    accessGroupService: {
      token: process.env.ACCESS_GROUP_SERVICE_TOKEN,
      apiUrl: process.env.ACCESS_GROUP_SERVICE_API_URL,
    },
    doiPrefix: process.env.DOI_PREFIX,
    expressSessionSecret: process.env.EXPRESS_SESSION_SECRET,
    functionalAccounts: [
      {
        username: "admin",
        email: "admin@your.site",
        password: "am2jf70TPNZsSan",
        role: "admin",
        global: true,
      },
      {
        username: "ingestor",
        email: "scicatingestor@your.site",
        password: "aman",
        role: "ingestor",
        global: false,
      },
      {
        username: "archiveManager",
        email: "scicatarchivemanager@your.site",
        password: "aman",
        role: "archivemanager",
        global: false,
      },
      {
        username: "proposalIngestor",
        email: "scicatproposalingestor@your.site",
        password: "aman",
        role: "proposalingestor",
        global: false,
      },
      {
        username: "user1",
        email: "user1@your.site",
        password: "a609316768619f154ef58db4d847b75e",
        role: "group1",
        global: false,
      },
      {
        username: "user2",
        email: "user2@your.site",
        password: "f522d1d715970073a6413474ca0e0f63",
        role: "group2",
        global: false,
      },
      {
        username: "user3",
        email: "user3@your.site",
        password: "70dc489e8ee823ae815e18d664424df2",
        role: "group3",
        global: false,
      },
      {
        username: "user4",
        email: "user4@your.site",
        password: "0014890e7020f515b92b767227ef2dfa",
        role: "group4",
        global: false,
      },
    ],
    httpMaxRedirects: process.env.HTTP_MAX_REDIRECTS ?? 5,
    httpTimeOut: process.env.HTTP_TIMEOUT ?? 5000,
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: parseInt(process.env.JWT_EXPIRES_IN ?? "3600", 10),
      neverExpires: process.env.JWT_NEVER_EXPIRES ?? "100y",
    },
    ldap: {
      server: {
        url: process.env.LDAP_URL,
        bindDN: process.env.LDAP_BIND_DN,
        bindCredentials: process.env.LDAP_BIND_CREDENTIALS,
        searchBase: process.env.LDAP_SEARCH_BASE,
        searchFilter: process.env.LDAP_SEARCH_FILTER,
        Mode: process.env.LDAP_MODE ?? "ad",
        externalIdAttr: process.env.LDAP_EXTERNAL_ID ?? "sAMAccountName",
        usernameAttr: process.env.LDAP_USERNAME ?? "displayName",
      },
    },
    oidc: {
      issuer: process.env.OIDC_ISSUER, // Example: https://identity.esss.dk/realm/ess
      clientID: process.env.OIDC_CLIENT_ID, // Example: scicat
      clientSecret: process.env.OIDC_CLIENT_SECRET, // Example: Aa1JIw3kv3mQlGFWrE3gOdkH6xreAwro
      callbackURL: process.env.OIDC_CALLBACK_URL, // Example: http://localhost:3000/api/v3/oidc/callback
      scope: process.env.OIDC_SCOPE, // Example: "openid profile email"
      successURL: process.env.OIDC_SUCCESS_URL, // Example: http://localhost:3000/explorer
      accessGroups: process.env.OIDC_ACCESS_GROUPS, // Example: None
      accessGroupProperty: process.env.OIDC_ACCESS_GROUPS_PROPERTY, // Example: groups
      autoLogout: process.env.OIDC_AUTO_LOGOUT || false,
      returnURL: process.env.OIDC_RETURN_URL,
    },
    logbook: {
      enabled:
        process.env.LOGBOOK_ENABLED && process.env.LOGBOOK_ENABLED === "yes"
          ? true
          : false,
      baseUrl:
        process.env.LOGBOOK_BASE_URL ?? "http://localhost:3030/scichatapi",
      username: process.env.LOGBOOK_USERNAME,
      password: process.env.LOGBOOK_PASSWORD,
    },
    metadataKeysReturnLimit: process.env.METADATA_KEYS_RETURN_LIMIT
      ? parseInt(process.env.METADATA_KEYS_RETURN_LIMIT, 10)
      : undefined,
    metadataParentInstancesReturnLimit: process.env
      .METADATA_PARENT_INSTANCES_RETURN_LIMIT
      ? parseInt(process.env.METADATA_PARENT_INSTANCES_RETURN_LIMIT, 10)
      : undefined,
    mongodbUri: process.env.MONGODB_URI,
    oaiProviderRoute: process.env.OAI_PROVIDER_ROUTE,
    pidPrefix: process.env.PID_PREFIX,
    port: parseInt(process.env.PORT || "3000", 10),
    publicURLprefix: process.env.PUBLIC_URL_PREFIX,
    rabbitMq: {
      enabled: process.env.RABBITMQ_ENABLED ?? "no",
      hostname: process.env.RABBITMQ_HOSTNAME,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD,
    },
    registerDoiUri: process.env.REGISTER_DOI_URI,
    registerMetadataUri: process.env.REGISTER_METADATA_URI,
    doiUsername: process.env.DOI_USERNAME,
    doiPassword: process.env.DOI_PASSWORD,
    site: process.env.SITE,
    smtp: {
      host: process.env.SMTP_HOST,
      messageFrom: process.env.SMTP_MESSAGE_FROM,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE,
    },
    policyTimes: {
      policyPublicationShiftInYears: process.env.POLICY_PUBLICATION_SHIFT ?? 3,
      policyRetentionShiftInYears: process.env.POLICY_RETENTION_SHIFT ?? -1,
    },
  };
};

export type OidcConfig = ReturnType<typeof configuration>["oidc"];

export default configuration;
