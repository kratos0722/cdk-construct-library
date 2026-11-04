import { Template } from 'aws-cdk-lib/assertions';

type Statement = {
  Effect?: string;
  Action?: unknown;
  Resource?: unknown;
};

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * Fails the test if any IAM identity policy (inline policy, managed policy, or
 * role-embedded policy) in the synthesized template grants `Action: "*"` on
 * `Resource: "*"` - the admin wildcard anti-pattern the library exists to avoid.
 *
 * Resource-level KMS key policies (which legitimately grant the account root
 * `kms:*`) are intentionally out of scope: they are not IAM identity policies
 * and never use a bare `"*"` action.
 */
export function expectNoAdminWildcard(template: Template): void {
  const offenders: Array<{ logicalId: string; statement: Statement }> = [];

  const scan = (logicalId: string, statements: unknown): void => {
    for (const raw of toArray(statements)) {
      const stmt = raw as Statement;
      if (stmt.Effect !== 'Allow') {
        continue;
      }
      const actions = toArray(stmt.Action);
      const resources = toArray(stmt.Resource);
      if (actions.includes('*') && resources.includes('*')) {
        offenders.push({ logicalId, statement: stmt });
      }
    }
  };

  const inlinePolicies = template.findResources('AWS::IAM::Policy');
  for (const [logicalId, resource] of Object.entries(inlinePolicies)) {
    scan(logicalId, resource.Properties?.PolicyDocument?.Statement);
  }

  const managedPolicies = template.findResources('AWS::IAM::ManagedPolicy');
  for (const [logicalId, resource] of Object.entries(managedPolicies)) {
    scan(logicalId, resource.Properties?.PolicyDocument?.Statement);
  }

  const roles = template.findResources('AWS::IAM::Role');
  for (const [logicalId, resource] of Object.entries(roles)) {
    for (const policy of toArray(resource.Properties?.Policies)) {
      scan(logicalId, (policy as { PolicyDocument?: { Statement?: unknown } }).PolicyDocument?.Statement);
    }
  }

  expect(offenders).toEqual([]);
}
