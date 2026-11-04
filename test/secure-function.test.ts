import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { SecureFunction, SecureFunctionProps } from '../src';
import { expectNoAdminWildcard } from './helpers';

function baseProps(overrides: Partial<SecureFunctionProps> = {}): SecureFunctionProps {
  return {
    handler: 'index.handler',
    code: Code.fromInline('exports.handler = async () => {};'),
    runtime: Runtime.NODEJS_20_X,
    ...overrides,
  };
}

function synth(props: SecureFunctionProps): Template {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  new SecureFunction(stack, 'Fn', props);
  return Template.fromStack(stack);
}

describe('SecureFunction', () => {
  it('enables active X-Ray tracing', () => {
    synth(baseProps()).hasResourceProperties('AWS::Lambda::Function', {
      TracingConfig: { Mode: 'Active' },
    });
  });

  it('applies conservative memory and timeout defaults', () => {
    synth(baseProps()).hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 256,
      Timeout: 30,
    });
  });

  it('provisions a dedicated Lambda execution role', () => {
    synth(baseProps()).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
          }),
        ]),
      }),
    });
  });

  it('never attaches broad AWS managed policies', () => {
    const roles = synth(baseProps()).findResources('AWS::IAM::Role');
    const withManaged = Object.values(roles).filter(
      (role) => ((role.Properties?.ManagedPolicyArns as unknown[]) ?? []).length > 0,
    );
    expect(withManaged).toEqual([]);
  });

  it('contains no admin wildcard (Action:* on Resource:*) policy', () => {
    expectNoAdminWildcard(synth(baseProps()));
  });

  it('wires a dedicated log group with explicit retention', () => {
    synth(baseProps()).hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 30,
    });
  });

  it('encrypts environment variables with a managed KMS key by default', () => {
    const template = synth(baseProps({ environment: { TABLE_NAME: 'orders' } }));
    template.resourceCountIs('AWS::KMS::Key', 1);
    template.hasResourceProperties('AWS::Lambda::Function', {
      KmsKeyArn: Match.anyValue(),
    });
  });

  it('does not mint a KMS key when there are no environment variables', () => {
    synth(baseProps()).resourceCountIs('AWS::KMS::Key', 0);
  });
});
