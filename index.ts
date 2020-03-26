import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import ecs_patterns = require('@aws-cdk/aws-ecs-patterns');
import certmgr = require('@aws-cdk/aws-certificatemanager');
import cdk = require('@aws-cdk/core');
import route53 = require('@aws-cdk/aws-route53');
// import elasticache = require('@aws-cdk/aws-elasticache');
import path = require('path');
import { SecretValue } from '@aws-cdk/core';

const envEU = { account: '883750447417', region: 'eu-central-1' };
const app = new cdk.App();
const stack = new cdk.Stack(app, 'FargateServiceWithLocalImage', {
  env: envEU
});

// Create VPC and Fargate Cluster
// NOTE: Limit AZs to avoid reaching resource quotas
const vpc = new ec2.Vpc(stack, 'MyVpc', { maxAzs: 2 });
const cluster = new ecs.Cluster(stack, 'Cluster', { vpc });

// const cacheCluster = new elasticache.CfnCacheCluster(stack, 'CacheCluster', {
//   cacheNodeType: 'cache.r5.large',
//   engine: 'redis',
//   numCacheNodes: 2,

// });

// create a task definition with CloudWatch Logs
const logging = new ecs.AwsLogDriver({
  streamPrefix: 'myapp'
});

const hostedZone = route53.HostedZone.fromLookup(stack, 'HostedZone', {
  domainName: 'danielszenasi.com',
  privateZone: false
});

const certificate = new certmgr.DnsValidatedCertificate(
  stack,
  'TestCertificate',
  {
    domainName: 'weeklychallenge.danielszenasi.com',
    hostedZone
  }
);

// Instantiate Fargate Service with a cluster and a local image that gets
// uploaded to an S3 staging bucket prior to being uploaded to ECR.
// A new repository is created in ECR and the Fargate service is created
// with the image from ECR.
new ecs_patterns.ApplicationLoadBalancedFargateService(
  stack,
  'FargateService',
  {
    cluster,
    certificate,
    domainZone: hostedZone,
    domainName: 'weeklychallenge.danielszenasi.com',
    taskImageOptions: {
      image: ecs.ContainerImage.fromAsset(
        path.resolve(__dirname, 'local-image')
      ),
      logDriver: logging,
      environment: {
        SLACK_SIGNING_SECRET: SecretValue.secretsManager(
          'slack-signing-secret'
        ).toString(),
        SLACK_BOT_TOKEN: SecretValue.secretsManager(
          'slack-bot-token'
        ).toString()
      }
    }
  }
);

app.synth();
