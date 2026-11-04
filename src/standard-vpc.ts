import { RemovalPolicy } from 'aws-cdk-lib';
import {
  FlowLogDestination,
  FlowLogTrafficType,
  GatewayVpcEndpointAwsService,
  IpAddresses,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { StructuredLogGroup } from './structured-log-group';

/** Properties for {@link StandardVpc}. */
export interface StandardVpcProps {
  /**
   * IPv4 CIDR for the VPC.
   *
   * @default '10.0.0.0/16'
   */
  readonly cidr?: string;

  /**
   * Maximum Availability Zones to span.
   *
   * @default 2
   */
  readonly maxAzs?: number;

  /**
   * Number of NAT gateways for egress from the private-with-egress tier.
   *
   * @default 1
   */
  readonly natGateways?: number;

  /**
   * Retention for the VPC flow-log group.
   *
   * @default RetentionDays.ONE_MONTH
   */
  readonly flowLogRetention?: RetentionDays;

  /**
   * Removal policy for the flow-log group.
   *
   * @default RemovalPolicy.RETAIN
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * A three-tier VPC with private networking and auditability on by default.
 *
 * Hardened controls:
 * - A `PRIVATE_ISOLATED` tier (no internet route) for data/stateful workloads
 *   and a `PRIVATE_WITH_EGRESS` tier for outbound-only workloads. The small
 *   public tier exists only to host the NAT gateway.
 * - S3 and DynamoDB **gateway** VPC endpoints so that traffic to those services
 *   stays on the AWS backbone (and off the NAT bill).
 * - VPC flow logs capturing ALL traffic into a retained
 *   {@link StructuredLogGroup}.
 *
 * @example
 * const net = new StandardVpc(this, 'Network');
 */
export class StandardVpc extends Construct {
  /** The underlying L2 VPC. */
  public readonly vpc: Vpc;

  /** The structured log group receiving VPC flow logs. */
  public readonly flowLogGroup: StructuredLogGroup;

  constructor(scope: Construct, id: string, props: StandardVpcProps = {}) {
    super(scope, id);

    this.flowLogGroup = new StructuredLogGroup(this, 'FlowLogGroup', {
      retention: props.flowLogRetention ?? RetentionDays.ONE_MONTH,
      removalPolicy: props.removalPolicy ?? RemovalPolicy.RETAIN,
    });

    this.vpc = new Vpc(this, 'Resource', {
      ipAddresses: IpAddresses.cidr(props.cidr ?? '10.0.0.0/16'),
      maxAzs: props.maxAzs ?? 2,
      natGateways: props.natGateways ?? 1,
      subnetConfiguration: [
        { name: 'Public', subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        {
          name: 'PrivateWithEgress',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'PrivateIsolated',
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      gatewayEndpoints: {
        S3: { service: GatewayVpcEndpointAwsService.S3 },
        DynamoDb: { service: GatewayVpcEndpointAwsService.DYNAMODB },
      },
      flowLogs: {
        CloudWatch: {
          destination: FlowLogDestination.toCloudWatchLogs(this.flowLogGroup.logGroup),
          trafficType: FlowLogTrafficType.ALL,
        },
      },
    });
  }
}
