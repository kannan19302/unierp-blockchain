#!/bin/bash
# =============================================================================
# Deploy UniERP Chaincodes to Fabric Network
# =============================================================================
# Builds, packages, installs, approves, and commits all 4 chaincodes.
# Uses the Fabric lifecycle (v2.x) chaincode deployment process.
# =============================================================================
set -e

ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/unerp.local/orderers/orderer.unerp.local/msp/tlscacerts/tlsca.unerp.local-cert.pem"
CC_SRC_PATH="/opt/gopath/src/github.com/chaincode"
CC_RUNTIME_LANGUAGE="node"
CC_VERSION="1.0"
CC_SEQUENCE="1"

deploy_chaincode() {
    local CC_NAME=$1
    local CHANNEL=$2
    local CC_PATH="$CC_SRC_PATH/$CC_NAME"

    echo ""
    echo "──────────────────────────────────────────────────────────"
    echo "Deploying chaincode: $CC_NAME on channel: $CHANNEL"
    echo "──────────────────────────────────────────────────────────"

    # Package
    echo "  [1/5] Packaging $CC_NAME..."
    docker exec fabric_cli peer lifecycle chaincode package \
        "$CC_NAME.tar.gz" \
        --path "$CC_PATH" \
        --lang "$CC_RUNTIME_LANGUAGE" \
        --label "${CC_NAME}_${CC_VERSION}"

    # Install
    echo "  [2/5] Installing $CC_NAME on peer..."
    docker exec fabric_cli peer lifecycle chaincode install \
        "$CC_NAME.tar.gz"

    # Get package ID
    echo "  [3/5] Getting package ID..."
    PACKAGE_ID=$(docker exec fabric_cli peer lifecycle chaincode queryinstalled \
        2>&1 | grep "${CC_NAME}_${CC_VERSION}" | sed 's/.*Package ID: //' | sed 's/, .*//')
    echo "  Package ID: $PACKAGE_ID"

    # Approve for org
    echo "  [4/5] Approving for Org1MSP..."
    docker exec fabric_cli peer lifecycle chaincode approveformyorg \
        -o orderer.unerp.local:7050 \
        --ordererTLSHostnameOverride orderer.unerp.local \
        --tls --cafile "$ORDERER_CA" \
        --channelID "$CHANNEL" \
        --name "$CC_NAME" \
        --version "$CC_VERSION" \
        --package-id "$PACKAGE_ID" \
        --sequence "$CC_SEQUENCE"

    # Commit
    echo "  [5/5] Committing $CC_NAME to $CHANNEL..."
    docker exec fabric_cli peer lifecycle chaincode commit \
        -o orderer.unerp.local:7050 \
        --ordererTLSHostnameOverride orderer.unerp.local \
        --tls --cafile "$ORDERER_CA" \
        --channelID "$CHANNEL" \
        --name "$CC_NAME" \
        --version "$CC_VERSION" \
        --sequence "$CC_SEQUENCE"

    echo "  ✅ $CC_NAME deployed successfully"
}

# Deploy each chaincode to its channel
deploy_chaincode "document-registry" "unerp-channel"
deploy_chaincode "finance-ledger" "unerp-channel"
deploy_chaincode "supply-chain-traceability" "supplychain-channel"
deploy_chaincode "procurement-lifecycle" "procurement-channel"

echo ""
echo "✅ All chaincodes deployed successfully"
echo ""
echo "  Channels:"
echo "    unerp-channel:         document-registry, finance-ledger"
echo "    supplychain-channel:   supply-chain-traceability"
echo "    procurement-channel:   procurement-lifecycle"
