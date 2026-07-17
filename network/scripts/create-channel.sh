#!/bin/bash
# =============================================================================
# Create UniERP Fabric Channels
# =============================================================================
set -e

ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/unerp.local/orderers/orderer.unerp.local/msp/tlscacerts/tlsca.unerp.local-cert.pem"

echo "▶ Creating unerp-channel..."
docker exec fabric_cli peer channel create \
    -o orderer.unerp.local:7050 \
    -c unerp-channel \
    -f ./channel-artifacts/unerp-channel.tx \
    --tls --cafile "$ORDERER_CA"

echo "▶ Joining peer to unerp-channel..."
docker exec fabric_cli peer channel join \
    -b unerp-channel.block

echo "▶ Creating supplychain-channel..."
docker exec fabric_cli peer channel create \
    -o orderer.unerp.local:7050 \
    -c supplychain-channel \
    -f ./channel-artifacts/supplychain-channel.tx \
    --tls --cafile "$ORDERER_CA"

echo "▶ Joining peer to supplychain-channel..."
docker exec fabric_cli peer channel join \
    -b supplychain-channel.block

echo "▶ Creating procurement-channel..."
docker exec fabric_cli peer channel create \
    -o orderer.unerp.local:7050 \
    -c procurement-channel \
    -f ./channel-artifacts/procurement-channel.tx \
    --tls --cafile "$ORDERER_CA"

echo "▶ Joining peer to procurement-channel..."
docker exec fabric_cli peer channel join \
    -b procurement-channel.block

echo "✅ All channels created and peer joined"
