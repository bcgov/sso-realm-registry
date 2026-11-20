export const isUserCleanupFeatureEnabled = () => process.env.ENABLE_USER_CLEANUP === 'true';

export const userCleanupFields = [
  'userCleanupEnabled',
  'userCleanupTypes',
  'userCleanupIdirAlias',
  'userCleanupAzureidirAlias',
  'userCleanupNotifications',
] as const;
