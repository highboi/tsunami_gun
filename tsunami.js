//get the gun object to interact with
gun = GUN();


/*
GUN JS AND TORRENTING FUNCTIONS
*/


//GET DATA ON GUN DB
function getGunData(id) {
	return new Promise((resolve, reject) => {
		gun.get(id).once((data, key) => {
			resolve(data);
		});
	});
}


//UPLOAD/SEED FILE FRAGMENTS TO GUN DB FOR TORRENTING
async function seedTorrent(url) {
	//request information/data from the url
	var urlRequest = new Request(url);
	var response = await fetch(urlRequest);

	//get the file type
	var filetype = response.headers.get("content-type");

	//extract the array buffer from the returned data
	var responseBuffer = await response.arrayBuffer();
	var buffer = new Uint8Array(responseBuffer);

	//divide the file data into fragments and store into an array
	var fragments = [];
	for (var byteindex = 0; byteindex < buffer.length; byteindex += 100) {
		//make a fragment object with the position, data, and associated url to be put into the fragments array
		var fragment = buffer.slice(byteindex, byteindex+100);
		fragments.push(fragment);
	}


	//get the position of each file fragment and update file data on gun.js
	var positions = [];
	for (var frag in fragments) {
		//update gun.js if this fragment is not up to date with the file from the url
		var fragment_key = frag + "_" +  url
		var gun_fragment = await getGunData(fragment_key);
		if (gun_fragment != {fragment: JSON.stringify(fragments[frag])}) {
			gun.get(fragment_key).put({fragment: JSON.stringify(fragments[frag])});
		}

		//push the current fragment index to an array of file fragment positions
		positions.push(frag);
	}

	//store the ledger containing positions of file fragments and the file type on gun.js
	var fragment_ledger_key = url + "_ledger";
	gun.get(fragment_ledger_key).put({positions: JSON.stringify(positions), filetype: filetype});

	//return a value of true since the seeding of the torrent succeeded
	return true;
}


//GET/DOWNLOAD FILE FRAGMENTS FROM GUN DB
async function downloadTorrent(url) {
	//get the ledger of file fragments for this url
	var ledger_key = url + "_ledger";
	var main_ledger = await getGunData(ledger_key);
	ledger = JSON.parse(main_ledger.positions);

	//get file fragments from the gun.js network
	var fragments = [];
	for (var position in ledger) {
		//get the file fragment for this position
		var fragment_key = position.toString() + "_" + url;
		var fragment = await getGunData(fragment_key);
		fragment = fragment.fragment;

		//add this file fragment to the array of file fragments
		fragments.push(JSON.parse(fragment));
	}

	//extract bytes of raw data from the file fragments
	var bytes = [];
	for (var frag of fragments) {
		for (var byte of Object.values(frag)) {
			bytes.push(byte);
		}
	}

	//convert the byte array into a blob object
	var buffer = Uint8Array.from(bytes);
	var blob = new Blob([buffer], {
		type: main_ledger.filetype
	});

	//make a url reference to the blob object for accessing the file data
	var fileurl = URL.createObjectURL(blob);

	//return the file fragments for processing
	return fileurl;
}


/*
WEBPAGE FUNCTIONS
*/


//GET ALL OF THE WEBPAGE REFERENCES ON THE CURRENT WEBPAGE
function getPageLinks() {
	//get all of the link elements on the current page
	var link_elements = document.getElementsByTagName("a");
	link_elements = Array.from(link_elements);

	//extract the links for each anchor on the current page
	var page_links = [];
	link_elements.forEach((item, index) => {
		//get the full relative path of the current webpage and store it to the array
		var full_link = item.pathname + item.search;
		page_links.push(full_link);
	});

	return {
		link_elements: link_elements,
		page_links: page_links
	};
}

//GET ALL OF THE FILE URLS OF THE CURRENT WEBPAGE
function getFileElements() {
	//get all tags that could have a file url attached
	var sourceTags = Array.from(document.getElementsByTagName("source"));
	var styleTags = Array.from(document.getElementsByTagName("style"));
	var imgTags = Array.from(document.getElementsByTagName("img"));
	var scriptTags = Array.from(document.getElementsByTagName("script"));

	//concatenate all tags to one array
	var finalTags = sourceTags.concat(styleTags).concat(imgTags).concat(scriptTags);

	//return the final array of file elements on the webpage
	return finalTags;
}

//GET THE FILE LINKS FROM A LIST OF FILE ELEMENTS
function getFileUrls(fileTags) {
	//extract the source urls from the tags
	var sourceUrls = [];
	for (var tagindex in fileTags) {
		var tag = fileTags[tagindex];

		if (tag.src == "") {
			sourceUrls.push(undefined);
		} else {
			sourceUrls.push(tag.src);
		}
	}

	return sourceUrls;
}

//STORE THE CURRENT WEBPAGE
function storeCurrentPage() {
	//get the current url and webpage text
	var currentURL = window.location.pathname;
	var documentText = document.documentElement.outerHTML;

	//store the webpage on gun.js
	gun.get(currentURL).put({
		document_html: documentText
	});

	return true;
}


/*
MAIN GUN JS FUNCTIONALITY
*/
//check the hostname
if (window.location.hostname == "astro-tv.space" || window.location.hostname == "localhost") {
	(async () => {
		/*
		STORE THE CURRENT WEBPAGE AND LINK OTHER WEBPAGES TO GUN.JS
		*/

		//store the current document on gun
		storeCurrentPage();

		//get all of the page links on this current page
		var {link_elements, page_links} = getPageLinks();

		//get the document bodys stored on gun js
		var texts = [];
		for (var index in page_links) {
			//get the link to another webpage
			var link = page_links[index];
			var gunlink = await getGunData(link);

			//extract the html from the gun.js network
			if (gunlink != undefined) {
				texts.push(gunlink.document_html);
			} else {
				texts.push(gunlink);
			}
		}

		//add event listeners for each anchor tag
		link_elements.forEach((item, index) => {
			//make sure the anchor tag does not reference a central webpage if the gun data exists
			if (texts[index] != undefined) {
				item.href = "";
			}

			//replace the current document with the document from gun.js if the link is clicked
			item.onclick = (event) => {
				//get the html document associated with this link
				var document_text = texts[index];
				if (document_text != undefined) {
					//replace the current entry in the session history with the link the user clicked on
					history.replaceState(null, "", page_links[index]);

					//replace the html with the new webpage document
					document.open();
					document.write(document_text);
					document.body.style.background = "red";
					document.close();
				}
			};
		});

		/*
		USE GUN.JS TO STORE FILES ON THE CURRENT WEBPAGE FOR DECENTRALIZED STORAGE
		*/

		//get the file elements of the current webpage
		var fileTags = getFileElements();

		//get the source urls of the file tags/elements
		var sourceUrls = getFileUrls(fileTags);

		//seed each of the file urls using gun.js
		for (var url of sourceUrls) {
			//will seed the torrent if not seeded
			await seedTorrent(url);
		}
	})();
}
