import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { SecureQueue, SecureQueueProps } from '../src';

function synth(props?: SecureQueueProps): Template {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  new SecureQueue(stack, 'Queue', props);
  return Template.fromStack(stack);
}

describe('SecureQueue', () => {
  it('enables SQS-managed encryption by default', () => {
    synth().hasResourceProperties('AWS::SQS::Queue', {
      SqsManagedSseEnabled: true,
    });
  });

  it('creates an encrypted dead-letter queue and a redrive policy', () => {
    const template = synth();
    // Two queues: primary + DLQ.
    template.resourceCountIs('AWS::SQS::Queue', 2);
    template.hasResourceProperties('AWS::SQS::Queue', {
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }),
    });
  });

  it('denies non-TLS access through a queue policy', () => {
    synth().hasResourceProperties('AWS::SQS::QueuePolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Action: 'sqs:*',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('retains the queue by default', () => {
    synth().hasResource('AWS::SQS::Queue', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });

  it('supports customer KMS encryption', () => {
    synth({ encryption: QueueEncryption.KMS }).hasResourceProperties('AWS::SQS::Queue', {
      KmsMasterKeyId: Match.anyValue(),
    });
  });

  it('can run without a dead-letter queue', () => {
    const template = synth({ deadLetterQueue: false });
    template.resourceCountIs('AWS::SQS::Queue', 1);
    template.hasResourceProperties('AWS::SQS::Queue', {
      RedrivePolicy: Match.absent(),
    });
  });

  it('honors a maxReceiveCount override and DESTROY removal', () => {
    const template = synth({ maxReceiveCount: 3, removalPolicy: RemovalPolicy.DESTROY });
    template.hasResourceProperties('AWS::SQS::Queue', {
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 3 }),
    });
    template.hasResource('AWS::SQS::Queue', { DeletionPolicy: 'Delete' });
  });
});
