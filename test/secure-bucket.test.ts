import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { SecureBucket, SecureBucketProps } from '../src';

function synth(props?: SecureBucketProps): Template {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  new SecureBucket(stack, 'Bucket', props);
  return Template.fromStack(stack);
}

describe('SecureBucket', () => {
  it('enables S3-managed encryption by default', () => {
    synth().hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
    });
  });

  it('blocks all public access', () => {
    synth().hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('enables versioning', () => {
    synth().hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
    });
  });

  it('applies a baseline lifecycle rule', () => {
    synth().hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Status: 'Enabled',
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
            NoncurrentVersionExpiration: { NoncurrentDays: 365 },
          }),
        ]),
      },
    });
  });

  it('denies non-TLS access through a bucket policy', () => {
    synth().hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Action: 's3:*',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('retains the bucket by default', () => {
    synth().hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });

  it('supports customer KMS encryption and a DESTROY override', () => {
    const template = synth({
      encryption: BucketEncryption.KMS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          Match.objectLike({
            ServerSideEncryptionByDefault: Match.objectLike({ SSEAlgorithm: 'aws:kms' }),
          }),
        ],
      },
    });
    template.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Delete' });
  });
});
