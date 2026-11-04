import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IKey, Key } from 'aws-cdk-lib/aws-kms';
import { Code, Function as LambdaFunction, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { StructuredLogGroup } from './structured-log-group';

/** Properties for {@link SecureFunction}. */
export interface SecureFunctionProps {
  /** The name of the handler, e.g. `index.handler`. */
  readonly handler: string;

  /** The function source code. */
  readonly code: Code;

  /**
   * The runtime.
   *
   * @default Runtime.NODEJS_20_X
   */
  readonly runtime?: Runtime;

  /**
   * Memory in MB.
   *
   * @default 256
   */
  readonly memorySize?: number;

  /**
   * Execution timeout.
   *
   * @default Duration.seconds(30)
   */
  readonly timeout?: Duration;

  /**
   * X-Ray tracing mode.
   *
   * @default Tracing.ACTIVE
   */
  readonly tracing?: Tracing;

  /** Environment variables passed to the function. */
  readonly environment?: { readonly [key: string]: string };

  /**
   * Customer-managed KMS key for environment variable encryption. When omitted
   * and environment variables are present, a dedicated key is created (unless
   * {@link encryptEnvironment} is `false`).
   */
  readonly environmentEncryption?: IKey;

  /**
   * Create a dedicated customer-managed KMS key to encrypt environment
   * variables when none is supplied and variables are present.
   *
   * @default true
   */
  readonly encryptEnvironment?: boolean;

  /**
   * Retention for the function's dedicated {@link StructuredLogGroup}.
   *
   * @default RetentionDays.ONE_MONTH
   */
  readonly logRetention?: RetentionDays;

  /**
   * Removal policy applied to the log group and any generated KMS key.
   *
   * @default RemovalPolicy.RETAIN
   */
  readonly removalPolicy?: RemovalPolicy;

  /** Optional function description. */
  readonly description?: string;
}

/**
 * A Lambda function with observability and least-privilege wired in by default.
 *
 * Hardened controls:
 * - Active X-Ray tracing.
 * - A dedicated execution role built from scratch (never the broad managed
 *   admin policies) and granted only: write access to its own log group,
 *   X-Ray publish, and decrypt on its environment key.
 * - Logs routed to a dedicated {@link StructuredLogGroup} with explicit retention.
 * - Environment variables encrypted with a customer-managed KMS key.
 * - Conservative memory (256 MB) and timeout (30 s) defaults.
 *
 * @example
 * new SecureFunction(this, 'Api', {
 *   handler: 'index.handler',
 *   code: Code.fromAsset('lambda'),
 * });
 */
export class SecureFunction extends Construct {
  /** The underlying L2 Lambda function. */
  public readonly function: LambdaFunction;

  /** The dedicated least-privilege execution role. */
  public readonly role: Role;

  /** The dedicated structured log group backing the function. */
  public readonly logGroup: StructuredLogGroup;

  /** The KMS key used to encrypt environment variables, if any. */
  public readonly environmentKey?: IKey;

  constructor(scope: Construct, id: string, props: SecureFunctionProps) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? RemovalPolicy.RETAIN;

    // Dedicated execution role: start empty, grant only what is needed.
    this.role = new Role(this, 'ExecutionRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: 'Least-privilege execution role provisioned by SecureFunction',
    });

    // Dedicated log group with explicit retention, wired to the function.
    this.logGroup = new StructuredLogGroup(this, 'LogGroup', {
      retention: props.logRetention ?? RetentionDays.ONE_MONTH,
      removalPolicy,
    });
    this.logGroup.logGroup.grantWrite(this.role);

    // Only encrypt (and only mint a key) when there is something to encrypt.
    const environment =
      props.environment && Object.keys(props.environment).length > 0
        ? { ...props.environment }
        : undefined;

    let environmentEncryption = props.environmentEncryption;
    if (!environmentEncryption && environment && props.encryptEnvironment !== false) {
      environmentEncryption = new Key(this, 'EnvironmentKey', {
        description: 'Environment variable encryption key provisioned by SecureFunction',
        enableKeyRotation: true,
        removalPolicy,
      });
    }
    if (environmentEncryption) {
      environmentEncryption.grantDecrypt(this.role);
      this.environmentKey = environmentEncryption;
    }

    this.function = new LambdaFunction(this, 'Resource', {
      runtime: props.runtime ?? Runtime.NODEJS_20_X,
      handler: props.handler,
      code: props.code,
      role: this.role,
      tracing: props.tracing ?? Tracing.ACTIVE,
      memorySize: props.memorySize ?? 256,
      timeout: props.timeout ?? Duration.seconds(30),
      environment,
      environmentEncryption,
      logGroup: this.logGroup.logGroup,
      description: props.description,
    });
  }
}
