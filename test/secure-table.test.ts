import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { SecureTable, SecureTableProps } from '../src';

function synth(overrides?: Partial<SecureTableProps>): Template {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  new SecureTable(stack, 'Table', {
    partitionKey: { name: 'pk', type: AttributeType.STRING },
    ...overrides,
  });
  return Template.fromStack(stack);
}

describe('SecureTable', () => {
  it('enables server-side encryption with a KMS key', () => {
    synth().hasResourceProperties('AWS::DynamoDB::Table', {
      SSESpecification: Match.objectLike({ SSEEnabled: true }),
    });
  });

  it('enables point-in-time recovery', () => {
    synth().hasResourceProperties('AWS::DynamoDB::Table', {
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  it('defaults to on-demand billing', () => {
    synth().hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  it('retains the table by default', () => {
    synth().hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain' });
  });

  it('honours a provisioned billing override', () => {
    // In PROVISIONED mode CloudFormation omits BillingMode (it is the CFN
    // default) and emits a ProvisionedThroughput block instead - its presence
    // is what proves the override took effect.
    synth({ billingMode: BillingMode.PROVISIONED }).hasResourceProperties(
      'AWS::DynamoDB::Table',
      {
        ProvisionedThroughput: Match.objectLike({
          ReadCapacityUnits: Match.anyValue(),
          WriteCapacityUnits: Match.anyValue(),
        }),
      },
    );
  });
});
