     // Google Maps Initialisation //
     var map;
     let service = null;
     /* global google */

     function initMap() {
         map = new google.maps.Map(document.getElementById('map'), {
             center: { lat: 1.3521, lng: 103.8198 },
             zoom: 11
         });

         service = new google.maps.places.PlacesService(map);
     }

     /* global $ */
     /* Displayed */
     $(function() {
         $("#SearchBox").attr("disabled", true);
         $("#SearchButton").attr("disabled", true);

         $("#GetDataButton").click(function() {
             if (Displayed == false) {
                 DisplayCarparks();
                 $("#SearchBox").attr("disabled", false);
                 $("#SearchButton").attr("disabled", false);
             }
             else if (Displayed == true) {
                 GoogleMapRecenterAtSG();
                 CurrentPosition.setMap(null);
             }
         });

         $("#UseYourLocationButton").click(function() {
             DisplayCarparksOnLocation();
             $("#SearchBox").attr("disabled", false);
             $("#SearchButton").attr("disabled", false);
         });

         $("#SearchButton").click(function(event) {
             event.preventDefault();
             let SearchRequest = $("#SearchBox").val();
             let request = {
                 query: SearchRequest,
                 fields: ["name", "geometry"]
             };
             $("#SearchBox").val("");
             PlaceSearch(request);
         });

         $("#ReCenterButton").click(function() {
             GoogleMapRecenterAtSG();
             CurrentPosition.setMap(null);
         });

     });

     /* global axios */
     //The CarparkCondition Function returns the condition of the carpark based on the ratio of its available lots to total lots.
     //The colour returned will be the colour of the carpark's marker on google maps.
     function CarparkCondition(AL, TL) {
         parseFloat(AL);
         parseFloat(TL);
         let ratio = AL / TL;
         if (ratio >= 0.7) {
             return "green";
         }
         else if (ratio <= 0.35) {
             return "red";
         }
         else {
             return "yellow";
         }
     }

     //GetCarparkAvailability function makes the ajax call to retrieve one dataset
     async function GetCarparkAvailability() {
         const res = await axios.get("https://api.data.gov.sg/v1/transport/carpark-availability")
             .then(response => [response.data.items[0].carpark_data, response.data.items[0].timestamp]).catch(error => error);
         return res;
     }

     //GetCarparkInformation function makes the ajax call to retrieve the other dataset
     async function GetCarparkInformation() {
         const res = await axios.get("https://data.gov.sg/api/action/datastore_search", { params: { resource_id: "139a3035-e624-4f56-b63f-89ae28d4ae4c", limit: "1983" } })
             .then(response => response.data.result.records).catch(error => error);
         return res;
     }
     //https://developers.onemap.sg/commonapi/convert/3414to4326
     //Coordinate Convertor function makes the ajax call to convert the SVY21 format to the WGS84 format that the google maps api requires.
     async function CoordinateConvertor(FinalDataset) {
         let base_url = window.location.href;
         const res = await axios.post(base_url + "coordinate-convertor-function", { FinalDataset })
             .then(response => response).catch(error => error);
         return res;
     }

     //ProcessData function processes both dataset and combines them together to form a final dataset. It also adds the condition into this final dataset.
     async function ProcessData() {
         //Assigned variables to the raw data coming in.
         let RawCarparkAvailability = await GetCarparkAvailability();
         let CarparkInformationDataset = await GetCarparkInformation();

         //Separating the time stamp from the carpark availability.
         let TimeStamp = RawCarparkAvailability[1];
         let CarparkData = RawCarparkAvailability[0];

         //Extracting the different layered information into a single array of objects called CarparkAvailabilityDataset.
         let CarparkAvailabilityDataset = [];
         let CDL = CarparkData.length;
         for (let i = 0; i < CDL; i++) {
             let obj = {
                 CarparkNumber: CarparkData[i].carpark_number,
                 AvailableLots: CarparkData[i].carpark_info[0].lots_available,
                 TotalLots: CarparkData[i].carpark_info[0].total_lots
             };
             CarparkAvailabilityDataset.push(obj);
         }

         //Makes a copy of the CarparkAvailabilityDatset for debugging purposes.
         let FinalDataset = CarparkAvailabilityDataset.slice(0);
         let FDL = FinalDataset.length;
         let CIDL = CarparkInformationDataset.length;
         //These nested for loops match the carpark numbers of both dataset and merges them into a single array of objects, the FinalDataset.
         for (let j = 0; j < FDL; j++) {
             for (let k = 0; k < CIDL; k++) {
                 if (FinalDataset[j].CarparkNumber === CarparkInformationDataset[k].car_park_no) {
                     FinalDataset[j].Address = CarparkInformationDataset[k].address;
                     FinalDataset[j].CarparkBasement = CarparkInformationDataset[k].car_park_basement;
                     FinalDataset[j].CarparkDecks = CarparkInformationDataset[k].car_park_decks;
                     FinalDataset[j].CarparkType = CarparkInformationDataset[k].car_park_type;
                     FinalDataset[j].FreeParking = CarparkInformationDataset[k].free_parking;
                     FinalDataset[j].GantryHeight = CarparkInformationDataset[k].gantry_height;
                     FinalDataset[j].NightParking = CarparkInformationDataset[k].night_parking;
                     FinalDataset[j].ShortTermParking = CarparkInformationDataset[k].short_term_parking;
                     FinalDataset[j].ParkingSystemType = CarparkInformationDataset[k].type_of_parking_system;
                     FinalDataset[j].X_Coordinates = CarparkInformationDataset[k].x_coord;
                     FinalDataset[j].Y_Coordinates = CarparkInformationDataset[k].y_coord;
                     break;
                 }
             }
         }
         //This for loop goes through the Final Data set, isolates the X & Y Coordinates and passes it through the Coordinate Convertor function.
         //It then appends the lat and lng with the response from the api so that it can be pass through to the Google Maps API.
         let coordinate_convertor_input_array = [];
         for (let x = 0; x < FDL; x++) {
             if (FinalDataset[x].X_Coordinates !== undefined || FinalDataset[x].Y_Coordinates !== undefined) {
                 let coordinates = {
                     X: FinalDataset[x].X_Coordinates,
                     Y: FinalDataset[x].Y_Coordinates
                 };
                 coordinate_convertor_input_array.push(coordinates);
             }
         }

         //This for loop goes through the FinalDataset and adds in the condition by calling the CarparkCondition function.
         for (let z = 0; z < FDL; z++) {
             let AL = FinalDataset[z].AvailableLots;
             let TL = FinalDataset[z].TotalLots;
             let condition = CarparkCondition(AL, TL);
             FinalDataset[z].Condition = condition;
         }

         //This is a new Final Data Set named aptly Final Data Set V2 becomes I could not get the asynchronous nature of the final data set to work.
         //So this for loop checks to see if the x or y coordinates are undefined and those do not get added to the new final data set.
         let FinalDatasetV2 = [];
         for (let q = 0; q < FDL; q++) {
             if (FinalDataset[q].X_Coordinates !== undefined || FinalDataset[q].Y_Coordinates !== undefined) {
                 FinalDatasetV2.push(FinalDataset[q]);
             }
         }

         //This is the response from the internal coordinate convertor function.
         let response = await CoordinateConvertor(coordinate_convertor_input_array);
         let coordinate_convertor_output_object = response.data;

         //This for loop appends the lat and lng attributes to each object inside of the Final Data Set V2
         let FDL2 = FinalDatasetV2.length;
         for (let w = 0; w < FDL2; w++) {
             FinalDatasetV2[w].lat = coordinate_convertor_output_object[w].lat;
             FinalDatasetV2[w].lng = coordinate_convertor_output_object[w].lng;
         }
         //The function returns an array of the Time Stamp and the Final Dataset array.
         return [TimeStamp, FinalDatasetV2];
     }
     // Global Variables //

     /* global google */
     let CurrentPosition;
     let SearchPosition;
     let Displayed = false;
     let markers = [];
     const SGCOORDINATEOBJECT = { lat: 1.3521, lng: 103.8198 };
     let PlaceSearchPosition;
     let QueryRequest;

     // End of Global Variables //

     // Utility Functions Section //

     function resolveAfterXSeconds(x) {
         parseFloat(x);
         let y = x * 1000;
         return new Promise(resolve => {
             setTimeout(() => {
                 resolve('resolved');
             }, y);
         });
     }

     function GoogleMapSetZoom(x) {
         if ((typeof x) == "number") {
             map.setZoom(x);
         }
         else {
             console.log("Google Map Set Zoom Function Error, Please enter a valid number as the input.");
         }
     }

     function GoogleMapSetPositionByLatLng(lat, lng) {
         if ((typeof lat) == "number" && (typeof lng) == "number") {
             let pos = {
                 lat: lat,
                 lng: lng
             };
             map.setCenter(pos);
         }
         else {
             console.log("Google Map Set Postion By LatLng Function Error, Please enter a valid numbers as the inputs.");
         }
     }

     function GoogleMapSetPositionByCoordinateObject(pos) {
         if ((typeof pos) == "object") {
             map.setCenter(pos);
         }
         else {
             console.log("Google Map Set Postion By Coordinate Object Function Error, Please enter a valid object as the input.");
         }
     }

     function GoogleMapRecenterAtSG() {
         GoogleMapSetPositionByCoordinateObject(SGCOORDINATEOBJECT);
         GoogleMapSetZoom(11);
         if (CurrentPosition !== undefined) {
             CurrentPosition.setMap(null);
         }
         if (SearchPosition !== undefined) {
             SearchPosition.setMap(null);
         }
     }

     // End Of Utility Functions Section //

     // Main Function Section //
     function AddMarker(location, map, condition, label, CarparkContent) {
         function AddMarkerExecutor(location, map, condition, label, CarparkContent, IconLocation) {
             let marker = new google.maps.Marker({
                 position: location,
                 map: map,
                 label: label,
                 icon: IconLocation
             });
             marker.addListener('click', function() {
                 let infowindow = new google.maps.InfoWindow({
                     content: CarparkContent,
                 });
                 infowindow.open(map, marker);
             });
             return marker;
         }
         if (location.lat != undefined & location.lng != undefined) {
             if (condition == "red") {
                 let IconLocation = "static/photos/final-red-circle.png";
                 let x = AddMarkerExecutor(location, map, condition, label, CarparkContent, IconLocation);
                 return x;
             }
             else if (condition == "yellow") {
                 let IconLocation = "static/photos/final-yellow-circle.png";
                 let x = AddMarkerExecutor(location, map, condition, label, CarparkContent, IconLocation);
                 return x;
             }
             else if (condition == "green") {
                 let IconLocation = "static/photos/final-green-circle.png";
                 let x = AddMarkerExecutor(location, map, condition, label, CarparkContent, IconLocation);
                 return x;
             }
         }
     }

     function DisplayCarparks() {
         ProcessData().then(function(value) {
             let x = value[1];
             for (let i = 0; i < x.length; i++) {
                 if (x[i].lat == undefined || x[i].lng == undefined) {
                     delete x[i];
                 }
                 else {
                     let contentString = "<div>" + "<h5>" + "Address: " + "</h5>" + "<p>" + x[i].Address + "</p>" + "</div>" +
                         "<div>" + "<h5>" + "Free Parking: " + "</h5>" + "<p>" + x[i].FreeParking + "</p>" + "</div>" +
                         "<div>" + "<h5>" + "Night Parking: " + "</h5>" + "<p>" + x[i].NightParking + "</p>" + "</div>" +
                         "<div>" + "<h5>" + "Short Term Parking: " + "</h5>" + "<p>" + x[i].ShortTermParking + "</p>" + "</div>";
                     let y = AddMarker({ lat: x[i].lat, lng: x[i].lng }, map, x[i].Condition, x[i].AvailableLots, contentString);
                     markers.push(y);
                 }
             }
             let markerCluster = new MarkerClusterer(map, markers, { imagePath: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m' });
         });
         Displayed = true;
     }

     function CurrentLocationMarker(map, pos) {
         if (CurrentPosition == undefined) {
             CurrentPosition = new google.maps.Marker({
                 map: map,
                 animation: google.maps.Animation.DROP,
                 position: pos
             });
         }
         else {
             CurrentPosition.setMap(null);
             CurrentPosition = new google.maps.Marker({
                 map: map,
                 animation: google.maps.Animation.DROP,
                 position: pos
             });
         }
     }

     function GeoLocater() {
         let infoWindow = new google.maps.InfoWindow();
         // Try HTML5 geolocation.
         if (navigator.geolocation) {
             navigator.geolocation.getCurrentPosition(function(position) {
                 var pos = {
                     lat: position.coords.latitude,
                     lng: position.coords.longitude
                 };

                 infoWindow.setPosition(pos);
                 map.setCenter(pos);
                 map.setZoom(14);
                 CurrentLocationMarker(map, pos);
             }, function() {
                 handleLocationError(true, infoWindow, map.getCenter());
             });
         }
         else {
             // Browser doesn't support Geolocation
             handleLocationError(false, infoWindow, map.getCenter());
         }

         function handleLocationError(browserHasGeolocation, infoWindow, pos) {
             infoWindow.setPosition(pos);
             infoWindow.setContent(browserHasGeolocation ?
                 'Error: The Geolocation service failed.' :
                 'Error: Your browser doesn\'t support geolocation.');
             infoWindow.open(map);
         }
     }

     async function DisplayCarparksOnLocation() {
         if (Displayed == false) {
             let x = await DisplayCarparks();
             let y = await resolveAfterXSeconds(3);
             GeoLocater();
         }
         else if (Displayed == true) {
             GeoLocater();
         }
         else {
             console.log("ERROR");
         }
     }
     // End of Main Function Section //

     // Search Functionality //
     function PlaceSearch(request) {
         function PlaceSearchExecutor(results) {
             PlaceSearchPosition = results[0].geometry.location;
             SearchPositionMaker(map, PlaceSearchPosition);
             GoogleMapSetZoom(14);
             GoogleMapSetPositionByCoordinateObject(PlaceSearchPosition);
         }
         service.findPlaceFromQuery(request, function(results, status) {
             if (status === google.maps.places.PlacesServiceStatus.OK) {
                 if (PlaceSearchPosition == undefined) {
                     PlaceSearchExecutor(results);
                 }
                 else {
                     SearchPosition.setMap(null);
                     PlaceSearchExecutor(results);
                 }
             }
         });
     }

     function SearchPositionMaker(map, pos) {
         function SearchPositionMakerExecutor() {
             SearchPosition = new google.maps.Marker({
                 map: map,
                 animation: google.maps.Animation.DROP,
                 position: pos
             });
         }
         if (CurrentPosition != undefined) {
             CurrentPosition.setMap(null);
         }
         if (SearchPosition == undefined) {
             SearchPositionMakerExecutor();
         }
         else {
             SearchPosition.setMap(null);
             SearchPositionMakerExecutor();
         }
     }

     // End of Search Funcitonality //
     