﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.Mvc;
using MonitorNetwork.Database;
using MonitorNetwork.Models;
using MonitorNetwork.BLL;
using System.Net;

namespace MonitorNetwork.Controllers
{
    [CheckAuthorization]
    public class HomeController : Controller
    {
        private MNDatabase db = new MNDatabase();

        public ActionResult Index()
        {
            NetworkModel nm = new NetworkModel();
            nm.transactions = db.transaction.ToList();

            SetupJavascriptData(nm);

            return View(nm);
        }

        public ActionResult EncryptThenSend(int? id)
        {
            if (id == null)
            {
                return new HttpStatusCodeResult(HttpStatusCode.BadRequest);
            }
            transaction transaction = db.transaction.Find(id);
            if (transaction == null)
            {
                return HttpNotFound();
            }

            transaction.isEncrypted = true;
            transaction.isSent = true;

            db.SaveChanges();

            return PartialView("_EncryptTransactionRowPartial", transaction);
        }

        public ActionResult SetRelayActive(int relayId, bool isActive)
        {
            relay relay = db.relay.Find(relayId);
            if (relay == null)
            {
                return HttpNotFound();
            }

            relay.isActive = isActive;

            db.SaveChanges();

            return null;
        }

        public ActionResult SetConnectionActive(int connectionId, bool isActive)
        {
            connections connection = db.connections.Find(connectionId);
            if (connection == null)
            {
                return HttpNotFound();
            }

            connection.isActive = isActive;

            db.SaveChanges();

            return null;
        }

        public ActionResult EntireDatabase()
        {
            EntireDatabase edb = new EntireDatabase();

            edb.accounts = db.account.AsEnumerable();
            edb.creditcards = db.creditcard.AsEnumerable();
            edb.relays = db.relay.AsEnumerable();
            edb.stores = db.store.AsEnumerable();
            edb.transaction = db.transaction.AsEnumerable();
            edb.user = db.user.AsEnumerable();
            edb.connections = db.connections.AsEnumerable();

            return View(edb);
        }

        public void SetupJavascriptData(NetworkModel nm)
        {

            nm.connections = (from conn in db.connections
                              select new Connections
                              {
                                  connID = conn.connID,
                                  storeID = conn.storeID,
                                  relayID = conn.relayID,
                                  destRelayID = conn.destRelayID,
                                  weight = conn.weight,
                                  isActive = conn.isActive
                              }).ToList();

            nm.relays = (from relay in db.relay
                         select new Relays
                         {
                             relayID = relay.relayID,
                             relayIP = relay.relayIP,
                             queueLimit = relay.queueLimit,
                             isActive = relay.isActive,
                             isProcessingCenter = relay.isProcessingCenter
                         }).ToList();

            nm.stores = (from store in db.store
                         select new Stores
                         {
                             storeID = store.storeID,
                             storeIP = store.storeIP,
                             merchantName = store.merchantName
                         }).ToList();

            nm.cytoscapeNodes = (from relay in db.relay
                                 select new CytoscapeData
                                 {
                                     data = new CytoscapeNode()
                                     {
                                         id = "r" + relay.relayID,
                                         label = relay.relayIP.Substring(8),
                                         parent = relay.isProcessingCenter ? "" : "p"+relay.regionID,
                                         name = relay.isProcessingCenter ? "c" + relay.relayID : relay.isGateway ? "g" + relay.relayID : "r" + relay.relayID
                                     }
                                 })
                        .Concat(from store in db.store
                                select new CytoscapeData
                                {
                                    data = new CytoscapeNode()
                                    {
                                        id = "s" + store.storeID,
                                        label = store.storeIP.Substring(8),
                                        parent = "p" + store.regionID,
                                        name = "s" + store.storeID
                                    }
                                })
                        .Concat(from region in db.region
                                select new CytoscapeData
                                {
                                    data = new CytoscapeNode()
                                    {
                                        id = "p" + region.regionID,
                                        label = region.colors.colorName,
                                        parent = "p" + region.regionID,
                                        name = "p" + region.regionID
                                    }
                                }).ToList();

            nm.cytoscapeEdges = (from conn in db.connections
                                 select new CytoscapeData
                                 {
                                     data = new CytoscapeEdge()
                                     {
                                         id = conn.relayID.HasValue ? "r" + conn.relayID + "r" + conn.destRelayID : "s" + conn.storeID + "r" + conn.destRelayID,
                                         weight = conn.weight,
                                         source = conn.relayID.HasValue ? "r" + conn.relayID : "s" + conn.storeID,
                                         target = "r" + conn.destRelayID
                                     }
                                 }).ToList();
        }

		public ActionResult ProcessTransaction(int id)
		{
			transaction currentTransaction = db.transaction.Where(x => x.transactionID == id).FirstOrDefault();
			

			creditcard currentCard = currentTransaction.creditcard;

			account currentAccount = currentCard.account;

			var totalSpendingCredit = currentAccount.spendingLimit - currentAccount.balance;

			if (currentTransaction.isCredit && currentTransaction.amount < totalSpendingCredit)
			{
				//transaction approved
				currentTransaction.status = true;
				currentAccount.balance = currentAccount.balance + currentTransaction.amount;
				db.SaveChanges();
			}

			else if (!currentTransaction.isCredit && currentTransaction.amount < currentAccount.balance)
			{
				//transaction approved
				currentTransaction.status = true;
				currentAccount.balance = currentAccount.balance - currentTransaction.amount;
				db.SaveChanges();
			}

			else
			{
				//transaction declined
				currentTransaction.status = false;
				db.SaveChanges();
			}

				return PartialView("_DetailTransactionRowPartial", currentTransaction);
		}

		public ActionResult ReadyToBeProcessed(int id)
		{
			transaction currentTransaction = db.transaction.Where(x => x.transactionID == id).FirstOrDefault();

			currentTransaction.atProcCenter = true;
			db.SaveChanges();

			return PartialView("_ProcessingTransactionPartial", currentTransaction);
		}

		public ActionResult SendBackToStore(int id)
		{
			transaction currentTransaction = db.transaction.Where(x => x.transactionID == id).FirstOrDefault();

			return PartialView("_EncryptProcessedTransactionPartial", currentTransaction);
		}

		public ActionResult DecryptAtEnd(int id)
		{
			if (id == null)
			{
				return new HttpStatusCodeResult(HttpStatusCode.BadRequest);
			}
			transaction transaction = db.transaction.Find(id);
			if (transaction == null)
			{
				return HttpNotFound();
			}

			transaction.isEncrypted = false;
			transaction.isSent = true;

			db.SaveChanges();
			return PartialView("_FinishedTransactionsPartial", transaction);
		}

	}
}