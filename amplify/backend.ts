import { defineBackend } from '@aws-amplify/backend'
import { auth } from './auth/resource'

const backend = defineBackend({ auth })

// No public sign-up: only accounts created in the Cognito console can sign in.
const { cfnUserPool, cfnUserPoolClient } = backend.auth.resources.cfnResources
cfnUserPool.adminCreateUserConfig = { allowAdminCreateUserOnly: true }

// Password sign-in (SRP) for everyone, plus the custom one-click flow used by the demo account.
cfnUserPoolClient.explicitAuthFlows = ['ALLOW_USER_SRP_AUTH', 'ALLOW_CUSTOM_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']
