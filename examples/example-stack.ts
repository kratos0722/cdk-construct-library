import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import {
  SecureBucket,
  SecureFunction,
  SecureTable,
  StandardVpc,
  StructuredLogGroup,
} from '../src';

/**
 * A representative platform baseline stack composed entirely from the library.
 *
 * It demonstrates the core value proposition: a product team gets a hardened
 * network, bucket, table, log group and function - with least-privilege wiring
 * between them - without writing a single security control by hand.
 *
 * This stack is synth-only and account-agnostic; it needs no AWS credentials.
 */
export class PlatformBaselineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Hardened, audited network with private tiers and gateway endpoints.
    const network = new StandardVpc(this, 'Network', {
      cidr: '10.42.0.0/16',
      maxAzs: 2,
    });

    // Encrypted, versioned, TLS-only object storage.
    const bucket = new SecureBucket(this, 'AssetBucket');

    // Encrypted DynamoDB table with point-in-time recovery.
    const table = new SecureTable(this, 'SessionsTable', {
      partitionKey: { name: 'sessionId', type: AttributeType.STRING },
    });

    // A shared structured audit log group.
    const auditLog = new StructuredLogGroup(this, 'AuditLog');

    // Traced, least-privilege Lambda with env encryption and a dedicated log group.
    const api = new SecureFunction(this, 'ApiHandler', {
      handler: 'index.handler',
      code: Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(15),
      environment: {
        BUCKET_NAME: bucket.bucket.bucketName,
        TABLE_NAME: table.table.tableName,
      },
    });

    // Least-privilege, resource-scoped grants between the composed constructs.
    bucket.bucket.grantReadWrite(api.function);
    table.table.grantReadWriteData(api.function);

    new CfnOutput(this, 'VpcId', { value: network.vpc.vpcId });
    new CfnOutput(this, 'BucketName', { value: bucket.bucket.bucketName });
    new CfnOutput(this, 'TableName', { value: table.table.tableName });
    new CfnOutput(this, 'AuditLogGroupName', { value: auditLog.logGroupName });
  }
}
