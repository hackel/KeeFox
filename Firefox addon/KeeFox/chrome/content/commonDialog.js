/*
KeeFox - Allows Firefox to communicate with KeePass (via the KeePassRPC KeePass plugin)
Copyright 2008-2010 Chris Tomlinson <keefox@christomlinson.name>
  
This hooks onto every common dialog in Firefox and for any dialog that contains one
username and one password (with the usual Firefox field IDs) it will discover
any matching logins and depending on preferences, etc. it will fill in the
dialog fields and/or populate a drop down box containing all of the matching logins.

TODO: extend so that new passwords can be saved automatically too (at the moment
you have to add them via KeePass)

TODO: streamline log-in when starting without an active connection to an
open KeePass database

Some ideas and code snippets from AutoAuth Firefox extension:
https://addons.mozilla.org/en-US/firefox/addon/4949

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
*/

Components.utils.import("resource://kfmod/KF.js");

var keeFoxDialogManager = {

    __promptBundle : null, // String bundle for L10N
    get _promptBundle() {
        if (!this.__promptBundle) {
            var bunService = Components.classes["@mozilla.org/intl/stringbundle;1"].
                             getService(Components.interfaces.nsIStringBundleService);
            this.__promptBundle = bunService.createBundle(
                        "chrome://global/locale/prompts.properties");
            if (!this.__promptBundle)
                throw "Prompt string bundle not present!";
        }

        return this.__promptBundle;
    },
    
    dialogInit : function(e) {
        try {
            keeFoxDialogManager.autoFill();
        } catch (exception) {
            keeFoxInst._KFLog.error(exception);
        }
    },
    
    // fill in the dialog with the first matched login found and/or the list of all matched logins
    autoFill : function()
    {
        if (document.getElementById("loginTextbox") != null
		    && document.getElementById("password1Textbox") != null
		    && document.getElementById("loginContainer") != null
		    && !document.getElementById("loginContainer").hidden
		    && document.getElementById("password1Container") != null
		    && !document.getElementById("password1Container").hidden)
		{
		    
		    // auto fill the dialog by default unless a preference or tab variable tells us otherwise
		    var autoFill = keeFoxInst._keeFoxExtension.prefs.getValue("autoFillDialogs",true);
            
            // do not auto submit the dialog by default unless a preference or tab variable tells us otherwise
            var autoSubmit = keeFoxInst._keeFoxExtension.prefs.getValue("autoSubmitDialogs",false);
            
            // overwrite existing username by default unless a preference or tab variable tells us otherwise
            var overWriteFieldsAutomatically = keeFoxInst._keeFoxExtension.prefs.getValue("overWriteFieldsAutomatically",true);
                
		    if (keeFoxInst._keeFoxExtension.prefs.has("lastProtocolAuthAttempt"))
            {
                if (Math.round(new Date().getTime() / 1000) - keeFoxInst._keeFoxExtension.prefs.get("lastProtocolAuthAttempt") <= 3)
                {
                    autoFill = false;
                    autoSubmit = false;
                }
            }
            
			if (document.getElementById("loginTextbox").getAttribute("value") != ''
			    && document.getElementById("password1Textbox").getAttribute("value") != ''
			    && !overWriteFieldsAutomatically)
			{	
			    autoFill = false;
                autoSubmit = false;
			}
			
			var host = "";
			var realm = "";
			
			// e.g. en-US:
			// A username and password are being requested by %2$S. The site says: "%1$S"
			var currentRealmL10nPattern = this._promptBundle.GetStringFromName("EnterLoginForRealm");

            var realmFirst = false;
            if (currentRealmL10nPattern.indexOf("%2$S") > currentRealmL10nPattern.indexOf("%1$S"))
                realmFirst = true;

            currentRealmL10nPattern = currentRealmL10nPattern.replace("%2$S","(.+)").replace("%1$S","(.+)");
            var regEx = new RegExp(currentRealmL10nPattern);

            matches = document.getElementById("info.body").firstChild.nodeValue.match(regEx);
            if (matches !== null && typeof matches[1] !== "undefined" && typeof matches[2] !== "undefined") {
                if (realmFirst)
                {
                    host = matches[2];
                    realm = matches[1];
                } else
                {
                    host = matches[1];
                    realm = matches[2];
                }
            }
            
            if (host.length < 1)
            {
                // e.g. en-US:
			    // The proxy %2$S is requesting a username and password. The site says: "%1$S"
			    var currentProxyL10nPattern = this._promptBundle.GetStringFromName("EnterLoginForProxy");

                realmFirst = false;
                if (currentProxyL10nPattern.indexOf("%2$S") > currentProxyL10nPattern.indexOf("%1$S"))
                    realmFirst = true;

                currentProxyL10nPattern = currentProxyL10nPattern.replace("%2$S","(.+)").replace("%1$S","(.+)");
                var regEx = new RegExp(currentProxyL10nPattern);

                matches = document.getElementById("info.body").firstChild.nodeValue.match(regEx);
                if (matches !== null && typeof matches[1] !== "undefined" && typeof matches[2] !== "undefined") {
                    if (realmFirst)
                    {
                        host = matches[2];
                        realm = matches[1];
                    } else
                    {
                        host = matches[1];
                        realm = matches[2];
                    }
                }
            }
            
            if (host.length < 1)
                return;
                
                
            // try to pick out the host from the full protocol, host and port
            try
            {
                var ioService = Components.classes["@mozilla.org/network/io-service;1"].
                               getService(Components.interfaces.nsIIOService);
                var uri = ioService.newURI(host, null, null);
                host = uri.host;            
            } catch (exception) {
                if (keeFoxInst._KFLog.logSensitiveData)
                    keeFoxInst._KFLog.debug("Exception occured while trying to extract the host from this string: " + host + ". " + exception);
                else
                    keeFoxInst._KFLog.debug("Exception occured while trying to extract the host from a string");
            }    
								
		    // if we're not logged in to KeePass then we can't go on
            if (!keeFoxInst._keeFoxStorage.get("KeePassRPCActive", false))
            {
                //TODO: put notification text on dialog box to inform user
                // and have button to load KeePass and then refresh the dialog?
                return;
            } else if (!keeFoxInst._keeFoxStorage.get("KeePassDatabaseOpen", false))
            {
                //TODO: put notification text on dialog box to inform user
                // and have button to load database and then refresh the dialog?
                return;
            }
        
			// find all the logins
			var foundLogins = keeFoxInst.findLogins(host, null, realm, null);

            if (keeFoxInst._KFLog.logSensitiveData)
                keeFoxInst._KFLog.info("dialog: found " + foundLogins.length + " matching logins for '"+ realm + "' realm.");
            else
                keeFoxInst._KFLog.info("dialog: found " + foundLogins.length + " matching logins for a realm.");
			
			if (foundLogins.length <= 0)
			    return;
			    
			var matchedLogins = [];
			var showList;
			
			// for every login
			for (var i = 0; i < foundLogins.length; i++)
			{
		        try {
		            var username = 
                        foundLogins[i].otherFields[0];
                    var password = 
                        foundLogins[i].passwords[0];
                   
			        matchedLogins.push({ 'username' : username.value, 'password' : password.value, 'host' : host });
			        showList = true;

		        } catch (e) {
		            keeFoxInst._KFLog.error(e);
		        }
			}
				
			// create a drop down box with all matched logins
			if (showList) {
				var box = document.createElement("hbox");

				var button = document.createElement("button");
				//TODO: find a way to get string bundles into here without
				// referencing document specific vars that go out of scope
				// when windows are closed...button.setAttribute("label",
				// keeFoxInst.strbundle.getString("autoFillWith
				button.setAttribute("label", "Auto Fill With");
				button.setAttribute("onclick",'keeFoxDialogManager.fill(document.getElementById("autoauth-list").selectedItem.username, document.getElementById("autoauth-list").selectedItem.password);');

				var list = document.createElement("menulist");
				list.setAttribute("id","autoauth-list");
				var popup = document.createElement("menupopup");
				var done = false;
			
				for (var i = 0; i < matchedLogins.length; i++){
					var item = document.createElement("menuitem");
					item.setAttribute("label", matchedLogins[i].username + "@" + matchedLogins[i].host);
					item.username = matchedLogins[i].username;
					item.password = matchedLogins[i].password;

					popup.appendChild(item);
				}

				list.appendChild(popup);
				box.appendChild(button);
				box.appendChild(list);

				document.getElementById("loginContainer").parentNode.appendChild(box);
			}

			
			
			if (autoFill)
			{
			    // fill in the first matching login
			    document.getElementById("loginTextbox").value = matchedLogins[0].username
			    document.getElementById("password1Textbox").value = matchedLogins[0].password
			    //matchedLogins[0].username
			    
			    //TODO: make a better guess about which login should be autofilled.
			    // e.g. exact host and realm match has higher priority
			
			}
			
			if (autoSubmit)
			{
			    commonDialogOnAccept();
			    window.close();
			}
		}
    },
    
    fill : function (username, password)
    {
		document.getElementById("loginTextbox").value = username;
		document.getElementById("password1Textbox").value = password;		
		commonDialogOnAccept();
		window.close();
	}
};

window.addEventListener("load", keeFoxDialogManager.dialogInit, false);