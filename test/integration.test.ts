import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PlatformBaselineStack } from '../examples/example-stack';
import { expectNoAdminWildcard } from './helpers';

describe('PlatformBaselineStack (composition)', () => {
  const app = new App();
  const stack = new PlatformBaselineStack(app, 'Baseline', {
    env: { account: '111111111111', region: 'us-east-1' },
  });
  const template = Template.fromStack(stack);

  it('composes a hardened, versioned S3 bucket', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('composes a traced Lambda function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      TracingConfig: { Mode: 'Active' },
    });
  });

  it('composes a network with flow logs and both gateway endpoints', () => {
    template.resourceCountIs('AWS::EC2::FlowLog', 1);
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 2);
  });

  it('composes a DynamoDB table with point-in-time recovery', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  it('contains no admin wildcard IAM policies across the whole stack', () => {
    expectNoAdminWildcard(template);
  });
});
