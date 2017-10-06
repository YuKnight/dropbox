/// <reference path="./dropbox.min.d.ts" />

interface Window {
	saveChanges: Function;
	Dropbox: typeof Dropbox;
	//jQuery: any;
	//$: any;
	$tw: any;
	// Rx: typeof Rx;
}
declare const isInBlob: boolean;
declare const blobData: {

}
// type rxjs = typeof Rx;
type Hashmap<T> = { [K: string]: T };
namespace wrapper {

	const SCRIPT_CACHE = "201710052";
	//PARANOIA: Delete the window property of these libraries to prevent 
	//Javascript in the page from messing with them.
	// const Rx: rxjs = window.Rx;
	// delete window.Rx;

	// const Dropbox: typeof DropboxTypes.Dropbox = window.Dropbox;
	// delete window.Dropbox;

	//const $ = window.jQuery;
	//delete window.$;
	//delete window.jQuery;

	//declarations needed for the page
	declare const $tw: any, store: any, clearMessage: Function, displayMessage: Function;
	declare const story: any, main: Function, config: any;

	//load classes from Rx
	// const { Observable, Subject, Subscriber, Subscription } = Rx;
	type ListFolderResultEntries = DropboxTypes.files.ListFolderResult["entries"];

	class twits {
		targetOrigin: string = "*";
		originalBlob: Blob;
		messageSaverReady: boolean;
		iframe: HTMLIFrameElement;
		user: DropboxTypes.users.FullAccount;
		currentRev: string;
		originalText: string;
		originalPath: string;
		client: Dropbox;
		isProd: false
		apiKeyFull = "gy3j4gsa191p31x"
		apiKeyApps = "tu8jc7jsdeg55ta"
		token: {
			access_token: string,
			account_id: string,
			token_type: "bearer",
			uid: string
		} = {} as any;

		getKey() {
			return (this.type === "full" ? this.apiKeyFull : (this.type === "apps" ? this.apiKeyApps : ""))
		}
		constructor(public type: string, public preload: string) {
			if (type !== "apps" && type !== "full") throw "type must be either apps or full"
			this.client = new Dropbox({
				clientId: this.getKey()
			});

			// Authenticate against Dropbox
			this.setStatusMessage("Authenticating with Dropbox...");

			if (document.location.hash) {
				const data = document.location.hash.slice(1);
				data.split('&').map(e => e.split('=').map(f => decodeURIComponent(f))).forEach(e => {
					this.token[e[0]] = e[1];
				})
				//keep the hash on localhost for development purposes
				//it will be removed later when the wiki is loaded
				if (location.origin !== "http://localhost") location.hash = "";
			}

			if (!this.token.access_token) {
				if (preload) sessionStorage.setItem('twcloud-dropbox-path', preload);
				else sessionStorage.setItem('twcloud-dropbox-path', '');
				location.href = this.client.getAuthenticationUrl(location.origin + location.pathname + "?type=" + type);
				return;
			} else {
				this.client.setAccessToken(this.token.access_token);
			}
			if (!preload) preload = sessionStorage.getItem('twcloud-dropbox-path');
			sessionStorage.setItem('twcloud-dropbox-path', '');
			this.initApp(preload);
		}

		// Main application
		initApp(preload: string) {
			this.clearStatusMessage();
			this.client.usersGetCurrentAccount(undefined).then(res => {
				this.user = res;
				const profile = document.getElementById("twits-profile");
				const pic = document.createElement('img');
				pic.src = this.user.profile_photo_url;
				pic.classList.add("profile-pic");
				profile.appendChild(pic);
				const textdata = document.createElement('span');
				this.user.account_type
				textdata.innerText = this.user.name.display_name
					+ (this.user.team ? ("\n" + this.user.team.name) : "");
				textdata.classList.add(this.user.team ? "profile-name-team" : "profile-name");
				profile.appendChild(textdata);
				profile.classList.remove("startup");
				if (preload) this.openFile(preload);
				else this.readFolder("", document.getElementById("twits-files"));
			})
		};
		isFileMetadata(a: any): a is DropboxTypes.files.FileMetadataReference {
			return a[".tag"] === "file";
		}
		isFolderMetadata(a: any): a is DropboxTypes.files.FolderMetadataReference {
			return a[".tag"] === "folder";
		}
		isHtmlFile(stat: DropboxTypes.files.FileMetadataReference) {
			return ['.htm', '.html'].indexOf(stat.name.slice(stat.name.lastIndexOf('.'))) > -1
		}
		getHumanSize(size: number) {
			const TAGS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
			let power = 0;
			while (size >= 1024) {
				size /= 1024;
				power++;
			}
			return size.toFixed(1) + TAGS[power];
		}

		streamFilesListFolder(path, handler: (entries: ListFolderResultEntries, has_more: boolean) => void) {
			function resHandler(res) {
				handler(res.entries, !!res.has_more);
				if (res.has_more)
					return this.client.filesListFolderContinue({
						cursor: res.cursor
					}).then(resHandler)
			}

			this.client.filesListFolder({
				path: path
			}).then(resHandler);
		}
		readFolder(path, parentNode: Node) {
			const pageurl = new URL(location.href);
			const loadingMessage = document.createElement("li");
			loadingMessage.innerText = "Loading...";
			loadingMessage.classList.add("loading-message");

			var listParent = document.createElement("ol");
			listParent.appendChild(loadingMessage);

			parentNode.appendChild(listParent);

			const filelist: DropboxTypes.files.ListFolderResult["entries"] = [];
			this.streamFilesListFolder(path, (stats, has_more) => {
				filelist.push.apply(filelist, stats);
				loadingMessage.innerText = "Loading " + filelist.length + "...";

				if (has_more) return;

				loadingMessage.remove();

				filelist.sort((a, b) => {
					//order by isFolder DESC, name ASC
					return (+this.isFolderMetadata(b) - +this.isFolderMetadata(a))
						|| a.name.localeCompare(b.name);
				})

				for (var t = 0; t < filelist.length; t++) {
					const stat = filelist[t];

					var listItem = document.createElement("li"),
						classes = [];
					if (this.isFolderMetadata(stat)) {
						classes.push("twits-folder");
					} else if (this.isFileMetadata(stat)) {
						classes.push("twits-file");
						if (this.isHtmlFile(stat)) {
							classes.push("twits-file-html");
						}
					}
					var link;
					classes.push("twits-file-entry");
					if (this.isFolderMetadata(stat) || (this.isFileMetadata(stat) && this.isHtmlFile(stat))) {
						link = document.createElement("a");
						link.href = location.origin + location.pathname + location.search
							+ "&path=" + encodeURIComponent(stat.path_lower) + location.hash;
						link.setAttribute("data-twits-path", stat.path_lower);
						link.addEventListener("click", this.onClickFolderEntry(), false);
					} else {
						link = document.createElement("span");
					}
					link.className = classes.join(" ");
					var img = document.createElement("img");
					img.src = "dropbox-icons-broken.gif";
					img.style.width = "16px";
					img.style.height = "16px";
					link.appendChild(img);
					link.appendChild(document.createTextNode(stat.name));
					if (this.isFileMetadata(stat) && this.getHumanSize(stat.size)) {
						var size = document.createElement("span");
						size.appendChild(document.createTextNode(" (" + this.getHumanSize(stat.size) + ")"));
						link.appendChild(size);
					}
					listItem.appendChild(link);
					listParent.appendChild(listItem);
				}
			});
		};

		onClickFolderEntry() {
			const self = this;
			return function (this: HTMLAnchorElement, event) {
				var path = this.getAttribute("data-twits-path"),
					classes = this.className.split(" ");
				if (classes.indexOf("twits-folder") !== -1 && classes.indexOf("twits-folder-open") === -1) {
					classes.push("twits-folder-open");
					self.readFolder(path, this.parentNode);
				}
				if (classes.indexOf("twits-file-html") !== -1) {
					self.openFile(path);
				}
				this.className = classes.join(" ");
				event.preventDefault();
				return false;
			}
		};

		openFile(path) {
			// Read the TiddlyWiki file
			// We can't trust Dropbox to have detected that the file is UTF8, 
			// so we load it in binary and manually decode it
			this.setStatusMessage("Reading HTML file...");
			this.client.filesDownload({
				path: path
			}).then(res => {
				//debugger;
				this.currentRev = res.rev;
				return new Promise<{ data: string, blob: Blob }>(resolve => {
					const data: Blob = res.fileBlob;
					console.log(data.type);
					var reader = new FileReader();
					reader.addEventListener("loadend", () => {
						// We have to manually decode the file as UTF8, annoyingly
						// [ I wonder if this is still necessary in v2 since it is a buffer 
						// however I think this is converting from UTF8 to UTF16  -Arlen ]
						const byteData = new Uint8Array(reader.result);
						const unicode = this.manualConvertUTF8ToUnicode(byteData);
						this.originalPath = path;
						this.originalText = unicode;
						this.originalBlob = res.fileBlob;
						resolve({ data: unicode, blob: res.fileBlob });
					});
					reader.readAsArrayBuffer(data);
					//debugger;
				})
			}).then(({ data, blob }) => {
				this.loadTiddlywiki(data, blob)
			})

		}

		manualConvertUTF8ToUnicode(utf) {
			var uni = [],
				src = 0,
				b1, b2, b3,
				c;
			while (src < utf.length) {
				b1 = utf[src++];
				if (b1 < 0x80) {
					uni.push(String.fromCharCode(b1));
				} else if (b1 < 0xE0) {
					b2 = utf[src++];
					c = String.fromCharCode(((b1 & 0x1F) << 6) | (b2 & 0x3F));
					uni.push(c);
				} else {
					b2 = utf[src++];
					b3 = utf[src++];
					c = String.fromCharCode(((b1 & 0xF) << 12) | ((b2 & 0x3F) << 6) | (b3 & 0x3F));
					uni.push(c);
				}
			}
			return uni.join("");
		}


		getStatusPanel() {
			// debugger;
			var getElement = function (id, parentNode) {
				parentNode = parentNode || document;
				var el = document.getElementById(id);
				if (!el) {
					el = document.createElement("div");
					el.setAttribute("id", id);
					parentNode.appendChild(el);
				}
				return el;
			},
				status = getElement("twits-status", document.body),
				message = getElement("twits-message", status),
				progress = getElement("twits-progress", status);
			status.style.display = "block";
			if (this.user) {
				const profile = document.createElement('img');
				profile.src = this.user.profile_photo_url;
				profile.classList.add("profile-pic");
				status.insertBefore(profile, message);
			}
			return { status: status, message: message, progress: progress };
		};

		clearStatusMessage() {
			var status = this.getStatusPanel();
			status.status.style.display = "none";
		}

		setStatusMessage(text) {
			var status = this.getStatusPanel();
			while (status.message.hasChildNodes()) {
				status.message.removeChild(status.message.firstChild);
			}
			status.message.appendChild(document.createTextNode(text));
		};

		setProgress(text) {
			var status = this.getStatusPanel();
			while (status.progress.hasChildNodes()) {
				status.progress.removeChild(status.progress.firstChild);
			}
			status.progress.appendChild(document.createTextNode(text));
		};

		// Display an error
		showError(error) {
			this.setStatusMessage("Error: " + error);
			this.setProgress("");
		};

		requestScript(url: string) {
			return new Promise<string>(resolve => {
				var oReq = new XMLHttpRequest();
				oReq.open("GET", url, true);
				oReq.responseType = "text";

				oReq.onload = function (oEvent) {
					//var blob = new Blob([oReq.response], {type: "image/png"});
					resolve(oReq.response as string)
				};
				oReq.send();
			})
		}
		buildNewBlob(originalBlob, originalText) {
			const startIndex = originalText.indexOf('<html');
			const htmlheader = (startIndex === -1) ? "<" + "!DOCTYPE html>" : originalText.slice(0, startIndex);
			const modHeader = '(function(module){ var exports = module.exports;';
			const modFooter = '; return module.exports; })({ exports: {} });';
			const lines = [
				htmlheader,
				'<' + 'script>(function(){',
			]
			this.requestScript('dropbox.min.js').then(res => {
				lines.push("const Dropbox = " + modHeader + res + modFooter);
				return this.requestScript('twcloud.js?' + SCRIPT_CACHE)
			}).then(res => {
				lines.push(res);
				lines.push('})();');
				return this.requestScript('tiddly-saver-inject.js?' + SCRIPT_CACHE)
			}).then(res => {
				lines.push(res);
				lines.push('<' + '/script>')
				// const trailer = '<' + 'script>if(typeof config !== "undefined" && config && config.options) config.options.chkHttpReadOnly = false;<' + '/script>';
				var blob = new Blob([lines.join('\n\n'), originalBlob], { type: 'text/html' });
				const url = URL.createObjectURL(blob);
				delete this.client;
				sessionStorage.setItem('twcloud-dropbox-twits', JSON.stringify(this));
				location.href = url;
			})



		}

		loadTiddlywiki(data: string, blob: Blob) {
			const self = this;
			//allow-same-origin 
			document.body.innerHTML = `<iframe id="twits-iframe" sandbox="allow-same-origin allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-scripts"></iframe>`;
			this.iframe = document.getElementById('twits-iframe') as HTMLIFrameElement;
			this.buildNewBlob(blob, data);
			return true;
			// const inject = `<script src="${
			// 	location.origin + location.pathname.slice(0, location.pathname.lastIndexOf('/'))
			// 	}/tiddly-saver-inject.js?${SCRIPT_CACHE}"><` + `/script>`;
			// this.iframe.src = URL.createObjectURL(new Blob([blob, inject], { type: 'text/html' }));
			// this.iframe.addEventListener('load', (ev) => {

			// });
			// window.addEventListener('message', this.onmessage.bind(this));
			// return true;
		}
		setupSaving() {
			// const handle = setInterval(() => {
			// 	if (this.messageSaverReady) clearInterval(handle);
			// 	else this.iframe.contentWindow.postMessage({ message: 'welcome-tiddly-saver' }, this.targetOrigin);
			// }, 1000)
			// window.addEventListener('message', this.onmessage.bind(this));
			console.log('inserting message box');
			var messageBox = document.getElementById("tiddlyfox-message-box");
			if (!messageBox) {
				messageBox = document.createElement("div");
				messageBox.id = "tiddlyfox-message-box";
				messageBox.style.display = "none";
				document.body.appendChild(messageBox);
			}
			// Attach the event handler to the message box
			messageBox.addEventListener("tiddlyfox-save-file", (ev) => {
				// Get the details from the message
				var messageElement = event.target,
					path = messageElement.getAttribute("data-tiddlyfox-path"),
					content = messageElement.getAttribute("data-tiddlyfox-content"),
					backupPath = messageElement.getAttribute("data-tiddlyfox-backup-path");
					// messageId = "tiddlywiki-save-file-response-" + this.idGenerator++;

				if (path !== document.location.toString()) return;

				this.saveTiddlyWiki(content, (err) => {
					// Send a confirmation message
					var event = document.createEvent("Events");
					event.initEvent("tiddlyfox-have-saved-file", true, false);
					event.savedFilePath = path;
					messageElement.dispatchEvent(event);
				})

				// Remove the message element from the message box
				messageElement.parentNode.removeChild(messageElement);
			}, false);
		}
		onmessage(event) {
			if (event.data.message === 'save-file-tiddly-saver') {
				this.saveTiddlyWiki(event.data.data, (err) => {
					event.source.postMessage({ message: 'file-saved-tiddly-saver', id: event.data.id, error: err }, this.targetOrigin);
				})
			}
			else if (event.data.message === 'thankyou-tiddly-saver') {
				this.messageSaverReady = true;
				if (event.data.isTWC) event.source.postMessage({ message: 'original-html-tiddly-saver', originalText: this.originalText }, this.targetOrigin);
			}
			else if (event.data.message === 'update-tiddly-saver') {
				if (event.data.TW5SaverAdded) {
					alert("The saver for TW5 has now been added. Changes in TW5 will now be saved as usual.");
				}
			}

		}

		saveTiddlyWiki(text, callback) {
			this.setStatusMessage("Saving changes...");
			//TODO: add progress tracker
			this.client.filesUpload({
				path: this.originalPath,
				mode: {
					".tag": "update",
					"update": this.currentRev
				},
				contents: text
			}).then(res => {
				this.clearStatusMessage();
				this.currentRev = res.rev;
				callback(null);
			}).catch(err => {
				console.log(err);
				callback(err.toString());
			})
		}
	}
	// only load if we are on http or https, otherwise we are probably in a blob
	if (location.protocol.indexOf('http') === 0)
		document.addEventListener("DOMContentLoaded", function (event) {
			const url = new URL(location.href);
			const accessType = url.searchParams.get('type');
			const preload = url.searchParams.get('path');
			if (!accessType) return;
			document.getElementById('twits-selector').style.display = "none";
			new twits(accessType, preload && decodeURIComponent(preload));
		}, false);
	else if (location.protocol === "blob:")
		document.addEventListener("DOMContentLoaded", function (event) {
			const sessionstr = sessionStorage.getItem('twcloud-dropbox-twits');
			if (!sessionstr) return alert('The session could not be loaded');
			var session: twits = Object.assign(Object.create(twits.prototype), JSON.parse(sessionstr));
			session.client = new Dropbox({
				clientId: session.getKey(),
				accessToken: session.token.access_token
			});
			session.setupSaving();
		}, false);
}