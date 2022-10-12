//get the gun object to interact with
gun = GUN();

/*
GET DATA ON GUN DB
*/
function getGunData(id) {
	return new Promise((resolve, reject) => {
		gun.get(id).once((data, key) => {
			resolve(data);
		});
	});
}

/*
GET/DOWNLOAD FILE FRAGMENTS FROM GUN DB
*/
async function getGunFileData(url) {
	//get the ledger of file fragments for this url
	var ledger_key = url + "_ledger";
	var main_ledger = await getGunData(ledger_key);
	ledger = JSON.parse(main_ledger.positions);

	//an array to store all of the file fragments
	var fragments = [];

	//loop through all of the file positions to get the file fragments
	for (var position in ledger) {
		//get the file fragment for this position
		var fragment_key = position.toString() + "_" + url;
		var fragment = await getGunData(fragment_key);
		fragment = fragment.fragment;

		//add this file fragment to the array of file fragments
		fragments.push(JSON.parse(fragment));
	}

	//store the raw bytes of file data
	var bytes = [];

	//add the bytes to the final bytes array
	for (var frag of fragments) {
		for (var byte of Object.values(frag)) {
			bytes.push(byte);
		}
	}

	//make an array buffer/integer array from the bytes
	var buffer = Uint8Array.from(bytes);

	//make a new blob object out of this data
	var blob = new Blob([buffer], {
		type: main_ledger.filetype
	});

	//make a final file url reference to the file data
	var fileurl = URL.createObjectURL(blob);

	//return the file fragments for processing
	return fileurl;
}

/*
STORE THE CURRENT WEBPAGE
*/
function storeCurrentPage() {
	//get the current url the user is on
	var currentURL = window.location.pathname;

	//get the entire document text of the current page
	var documentText = document.documentElement.outerHTML;

	//store the webpage
	gun.get(currentURL).put({
		document_html: documentText
	});

	return;
}

/*
TRY TO GET THE CURRENT WEBPAGE FROM THE P2P DATABASE
*/
async function getCurrentPage() {
	//get the current url the user is on
	var currentURL = window.location.pathname;

	//get the current webpage text through gun js
	var current_doc = await getGunData(currentURL);

	return current_doc;
}


/*
MAIN GUN JS FUNCTIONALITY
*/
(async () => {
	/*
	STORE THE CURRENT WEBPAGE AND LINK OTHER WEBPAGES TO GUN.JS
	*/

	//store the current document on gun
	storeCurrentPage();

	//get all of the link elements on the current page
	var link_elements = document.getElementsByTagName("a");
	link_elements = Array.from(link_elements);

	//extract the links for each anchor on the current page
	var page_links = [];
	link_elements.forEach((item, index) => {
		//get the full relative path of the current webpage
		var full_link = item.pathname + item.search;

		//add this link to the page_links array
		page_links.push(full_link);
	});

	//get the document bodys stored on gun js
	var texts = [];
	for (var index in page_links) {
		var link = page_links[index];

		var gunlink = await getGunData(link);

		if (gunlink != undefined) {
			texts.push(gunlink.document_html);
		} else {
			texts.push(gunlink);
		}
	}

	//add event listeners for each anchor tag
	link_elements.forEach((item, index) => {
		item.onclick = (event) => {
			//get the document text associated with this link on gun js
			var document_text = texts[index];

			//if gun has this link stored, then redirect the user without requesting the server
			if (document_text != undefined) {
				//replace the current entry in the session history with the link the user clicked on
				history.replaceState(null, "", page_links[index]);

				//write the gun-stored document text to the page
				document.open();
				document.write(document_text);
				document.close();
			}
		};
	});

	/*
	USE GUN.JS TO STORE FILES ON THE CURRENT WEBPAGE FOR DECENTRALIZED STORAGE
	*/

	//get all tags that could have a file url attached
	var sourceTags = Array.from(document.getElementsByTagName("source"));
	var styleTags = Array.from(document.getElementsByTagName("style"));
	var imgTags = Array.from(document.getElementsByTagName("img"));
	var scriptTags = Array.from(document.getElementsByTagName("script"));

	//concatenate all tags to one array
	var finalTags = sourceTags.concat(styleTags).concat(imgTags).concat(scriptTags);

	//extract the source urls from the tags
	var sourceUrls = [];
	for (var tagindex in finalTags) {
		var tag = finalTags[tagindex];

		if (tag.src == "") {
			sourceUrls.push(undefined);
		} else {
			sourceUrls.push(tag.src);
		}
	}

	for (var url of sourceUrls) {
		//request information/data from the url
		var urlRequest = new Request(url);
		var response = await fetch(urlRequest);

		//get the file type
		var filetype = response.headers.get("content-type");

		//extract the array buffer from the returned data
		var responseBuffer = await response.arrayBuffer();
		var buffer = new Uint8Array(responseBuffer);

		//make an array to store file fragments
		var fragments = [];

		//divide the file data/buffer into fragments and store them in the fragments array
		for (var byteindex = 0; byteindex < buffer.length; byteindex += 100) {
			//make a fragment object with the position, data, and associated url to be put into the fragments array
			var fragment = buffer.slice(byteindex, byteindex+100);
			fragments.push(fragment);
		}

		//make an array for storing the positions of the file fragments for reassembly
		var positions = [];

		//check gun.js for any data fragments that are already on the network and store fragments not already stored on the network
		for (var frag in fragments) {
			//check for a preexisting file fragment for this url/file
			var fragment_key = frag + "_" +  url
			var gun_fragment = await getGunData(fragment_key);

			//store the fragment that is not on the gun.js network yet
			if (gun_fragment != {fragment: JSON.stringify(fragments[frag])}) {
				gun.get(fragment_key).put({fragment: JSON.stringify(fragments[frag])});
			}

			//push the current fragment index to an array of file fragment positions
			positions.push(frag);
		}

		//store the ledger for file fragments on gun.js
		var fragment_ledger_key = url + "_ledger";
		gun.get(fragment_ledger_key).put({positions: JSON.stringify(positions), filetype: filetype});
	}
})();
