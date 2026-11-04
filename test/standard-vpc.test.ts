import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { StandardVpc } from '../src';
import { expectNoAdminWildcard } from './helpers';

function synth(): Template {
  const app = new App();
  const stack = new Stack(app, 'TestStack', {
    env: { account: '111111111111', region: 'us-east-1' },
  });
  new StandardVpc(stack, 'Network');
  return Template.fromStack(stack);
}

describe('StandardVpc', () => {
  it('creates a single VPC', () => {
    synth().resourceCountIs('AWS::EC2::VPC', 1);
  });

  it('creates public, private-with-egress and private-isolated subnets across 2 AZs', () => {
    // 3 tiers x 2 AZs = 6 subnets.
    synth().resourceCountIs('AWS::EC2::Subnet', 6);
  });

  it('provisions S3 and DynamoDB gateway endpoints', () => {
    const template = synth();
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 2);
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      VpcEndpointType: 'Gateway',
    });
  });

  it('enables VPC flow logs capturing all traffic', () => {
    const template = synth();
    template.resourceCountIs('AWS::EC2::FlowLog', 1);
    template.hasResourceProperties('AWS::EC2::FlowLog', {
      TrafficType: 'ALL',
      ResourceType: 'VPC',
    });
  });

  it('has no admin wildcard IAM policies', () => {
    expectNoAdminWildcard(synth());
  });
});
