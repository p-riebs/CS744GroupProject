﻿//var processingCenterId;
//var nodeQueues = { "r1" : [{ transactionId: 100001, toProcCenter = true, storeId: "s1", destinationReached: false, timeoutObj : {timeoutObj} }] };
//var connectionQueues = { "s1r1" : { transactionId: 100001, toProcCenter = true, storeId: "s1", timeoutObj : {timeoutObj} } }
//var timeoutObj = { timeout: func, sendFunc: func, fromNode: "r1", toNode: "s6" }

var MILLI_SECOND_MOVEMENT_SPEED = 1500;

function sendTransactionToProcessCenter(transactionId, storeId) {
    moveTransaction({ transactionId: transactionId, toProcCenter: true, storeId: "s" + storeId, destinationReached: false, timeoutObj: { timeout: null, sendFunc: null, fromNode: "", toNode: "" } });
}

function sendTransactionToStore(transactionId, storeId) {
	moveTransaction({ transactionId: transactionId, toProcCenter: false, storeId: "s" + storeId, destinationReached: false, timeoutObj: { timeout: null, sendFunc: null, fromNode: "", toNode: "" } });
}

function moveTransaction(transaction) {
    if (transaction.toProcCenter) {
        sendToNode(null, transaction.storeId, transaction);
    } else {
        sendToNode(null, processingCenterId, transaction);
    }
}

function sendToNode(fromNode, toNode, transaction) {

    if (fromNode !== null) {

        if (queueIsAtLimit(toNode)) {
            droppedQueueLimitTransaction(fromNode, toNode, transaction);
            return;
        }

        processFromConnection(fromNode, toNode);
    }

    cy.$('#' + toNode).addClass('highlighted');

    if (!transactionExists(transaction.transactionId, elementQueues[toNode].queue) &&
        !hasReachedDestination(toNode, transaction)) {
        elementQueues[toNode].queue.push(transaction);
    }

    if (hasReachedDestination(toNode, transaction)) {
        // Transaction has reached it's destination.

        transaction.destinationReached = true;

        setTimeout(function () {
            if (getQueueLength(toNode) <= 1) {
                // No more transaction in the queue
                // Remove highlighting for node.
                cy.$('#' + toNode).removeClass('highlighted');
            }
        }, MILLI_SECOND_MOVEMENT_SPEED);

        if (transaction.toProcCenter) {
            reachedProcessingCenter(transaction.transactionId);
        }
        else
        {
			$.ajax({
				type: "GET",
				url: '/Home/DecryptAtEnd?id=' + transaction.transactionId,
				dataType: 'html',
				success: function (data) {
					$('#transactionRow' + transaction.transactionId).html(data);
				}
			});
        }

        return;
    }

    var path = getPath(toNode, transaction);

    if (path === null) {
        // No path was found to move the transaction to destination.
        if (graphStopped) {
            transaction.timeoutObj = { timeout: null, sendFunc: droppedNoPathTransaction, fromNode: fromNode, toNode: toNode };
        }
        else {
            var nodeTimeout = setTimeout(droppedNoPathTransaction, MILLI_SECOND_MOVEMENT_SPEED, fromNode, toNode, transaction);
            transaction.timeoutObj = { timeout: nodeTimeout, sendFunc: droppedNoPathTransaction, fromNode: fromNode, toNode: toNode };
        }
        
        return;
    }

    if ((fromNode !== null && toNode != processingCenterId && getQueueLength(toNode) > 1) || graphStopped) {
        // There are other transactions in the queue before this transaction or the graph has stopped.
        transaction.timeoutObj = { timeout: null, sendFunc: sendToConnection, fromNode: path[0], toNode: path[1] };

    } else {
        // There are no transactions in the queue before this transaction and the graph is active.
         
        // Start timeout to move transaction.
        var nodeTimeout = setTimeout(sendToConnection, MILLI_SECOND_MOVEMENT_SPEED, path[0], path[1], transaction);

        // Add timeouts to transaction for pausing and resuming.
        transaction.timeoutObj = { timeout: nodeTimeout, sendFunc: sendToConnection, fromNode: path[0], toNode: path[1] };
    }
}

function sendToConnection(fromNode, toNode, transaction) {

    var connectionId = findConnectionId(fromNode, toNode);
    // Check if there is a transaction all ready on the connection.
    if (!queueIsAtLimit(connectionId)) {
        // No transaction on the connection

        // Remove transaction from the node the transaction was just at.
        removeTransactionFromQueue(fromNode, transaction);

        if (getQueueLength(fromNode) <= 0) {
            // No more transaction in the queue
            // Remove highlighting for node.
            cy.$('#' + fromNode).removeClass('highlighted');
        }

        // Add transaction to connection, if it hasn't been added.
        elementQueues[connectionId].queue.push(transaction);

        addCSSClassToConnection(fromNode, toNode, "highlighted");

        var connectionTimeout = setTimeout(sendToNode, MILLI_SECOND_MOVEMENT_SPEED, fromNode, toNode, transaction);

        // Add timeouts to transaction for pausing and resuming.
        transaction.timeoutObj = { timeout: connectionTimeout, sendFunc: sendToNode, fromNode: fromNode, toNode: toNode };

        if (fromNode != processingCenterId && getQueueLength(fromNode) > 0) {
            // There is still transactions in the fromNode's queue, start the next one.
            sendTransactionToElement(elementQueues[fromNode].queue[0]);
        }

    } else {
        // Transaction already on connection.

        // Add transaction to connection queue.
        if (!transactionExists(transaction.transactionId, elementQueues[connectionId].queue)) {
            elementQueues[connectionId].queue.push(transaction);
        }

        transaction.timeoutObj = { timeout: null, sendFunc: sendToConnection, fromNode: fromNode, toNode: toNode };
    }
}

function processFromConnection(fromNode, toNode) {
    // Remove transaction from connection;
    var connectionId = findConnectionId(fromNode, toNode);
    elementQueues[connectionId].queue.shift();

    // Check if there is another transaction waiting for connection.
    if (getQueueLength(connectionId) > 0) {
        // Still transactions waiting on connection.

        // Start the next transaction waiting for the connection.
        var nextTransaction = elementQueues[connectionId].queue.shift();
        sendTransactionToElement(nextTransaction);
    } else {
        // No more transactions waiting on connection.
        removeCSSClassToConnection(fromNode, toNode, "highlighted");
    }
}

function droppedNoPathTransaction(fromNode, toNode, transaction) {

    $.ajax({
        type: "GET",
        url: '/Home/DropTransaction?id=' + transaction.transactionId,
        dataType: 'html',
        success: function (data) {
            $('#transactionRow' + transaction.transactionId).html(data);
        }
    });

    if (fromNode != null) {
        removeTransactionFromQueue(fromNode, transaction);
        cy.$('#' + fromNode).removeClass('highlighted');
        cy.$('#' + fromNode).addClass('dropped');
    } else {
        removeTransactionFromQueue(toNode, transaction);
        cy.$('#' + toNode).removeClass('highlighted');
        cy.$('#' + toNode).addClass('dropped');
    }

    setTimeout(function () {
        if (fromNode != null) {
            if (getQueueLength(fromNode) < 1) {
                cy.$('#' + fromNode).removeClass('dropped');
            } else {
                cy.$('#' + fromNode).addClass('highlighted');
                if (fromNode != processingCenterId && getQueueLength(fromNode) > 0) {
                    // There is still transactions in the fromNode's queue, start the next one.
                    sendTransactionToElement(elementQueues[fromNode].queue[0]);
                }
            }
        }
        else if (toNode != null) {
            if (getQueueLength(toNode) < 1) {
                cy.$('#' + toNode).removeClass('dropped');
            } else {
                cy.$('#' + toNode).addClass('highlighted');
                sendTransactionToElement(elementQueues[toNode].queue[0]);
            }
        }
    }, MILLI_SECOND_MOVEMENT_SPEED);
}

function droppedQueueLimitTransaction(fromNode, toNode, transaction) {
    removeCSSClassToConnection(fromNode, toNode, "highlighted");

    addCSSClassToConnection(fromNode, toNode, "dropped");

    $.ajax({
        type: "GET",
        url: '/Home/DropTransaction?id=' + transaction.transactionId,
        dataType: 'html',
        success: function (data) {
            $('#transactionRow' + transaction.transactionId).html(data);
        }
    });

    var connectionTimeout = setTimeout(removeDroppedTransaction, MILLI_SECOND_MOVEMENT_SPEED, fromNode, toNode, transaction);

    // Add timeouts to transaction for pausing and resuming.
    transaction.timeoutObj = { timeout: connectionTimeout, sendFunc: removeDroppedTransaction, fromNode: fromNode, toNode: toNode };
}

function removeDroppedTransaction(fromNode, toNode, transaction) {
    removeCSSClassToConnection(fromNode, toNode, "dropped");
    processFromConnection(fromNode, toNode);
}

function removeTransactionFromQueue(node, transaction) {
    var indexes = $.map(elementQueues[node].queue, function (obj, index) {
        if (obj.transactionId == transaction.transactionId) {
            return index;
        }
    });

    if (indexes[0] > -1) {
        elementQueues[node].queue.splice(indexes[0], 1);
    }
}