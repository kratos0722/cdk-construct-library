import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { StructuredLogGroup } from '../src';

function synth(fn: (stack: Stack) => void): Template {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  fn(stack);
  return Template.fromStack(stack);
}

describe('StructuredLogGroup', () => {
  it('defaults to 30-day retention', () => {
    synth((stack) => {
      new StructuredLogGroup(stack, 'Logs');
    }).hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 30,
    });
  });

  it('retains the log group by default', () => {
    synth((stack) => {
      new StructuredLogGroup(stack, 'Logs');
    }).hasResource('AWS::Logs::LogGroup', { DeletionPolicy: 'Retain' });
  });

  it('honours retention and removal-policy overrides', () => {
    const template = synth((stack) => {
      new StructuredLogGroup(stack, 'Logs', {
        retention: RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 });
    template.hasResource('AWS::Logs::LogGroup', { DeletionPolicy: 'Delete' });
  });

  it('formats a structured log record as JSON', () => {
    const line = StructuredLogGroup.formatLogRecord({
      level: 'INFO',
      message: 'service ready',
      service: 'checkout',
      correlationId: 'abc-123',
    });
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.level).toBe('INFO');
    expect(parsed.message).toBe('service ready');
    expect(parsed.service).toBe('checkout');
    expect(parsed.correlationId).toBe('abc-123');
    expect(typeof parsed.timestamp).toBe('string');
  });
});
