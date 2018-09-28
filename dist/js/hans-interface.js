angular.module('hansApp', ['ui.bootstrap','ui.router'])
.config(function($urlRouterProvider,$locationProvider,$stateProvider){
	$urlRouterProvider.otherwise("/"); // 404
	$locationProvider.html5Mode(true);
	
	$stateProvider
		.state(
			"index",
			{
				url:"/",
				templateUrl:"home.html",
				controller:"indexCtrl"
			}
		)
		.state(
			"hans-ui",
			{
				url:"/ui",
				templateUrl:"ui.html",
				controller:"hansInterfaceCtrl"
			}
		)
		.state(
			"error",
			{
				url:"/error",
				templateUrl:"error.html"
			}
		)
})
.controller('hansInterfaceCtrl', ['$scope', '$http','$state','$compile','$interval','Data', hansInterfaceCtrl])
.controller('indexCtrl', ['$scope', '$http','$timeout','$window','$state','Data', indexCtrl])
.service("Data", dataService);

function dataService () {
	
	this.violations = {};
	this.serverPort = 7070;
	this.robotControllerPort = 9090;

	// localhost
	this.ip = "http://localhost:"+this.serverPort;
	this.robotIp = "http://localhost:"+this.robotControllerPort;
	
	// TODO: this should be probably done in a better way
	this.namespaces = {
		"hsf":"http://data.open.ac.uk/kmi/hans#",
		"sf":"http://www.w3.org/ns/shacl#"
	}
	
}

function indexCtrl($scope,$http,$timeout,$window,$state, Data) {

	$http({
		
		method: 'POST',
		url: Data.ip + "/validate"
		
	}).then(function successCallback(response) {
	
		if (response.status == 200) {
			
			Data.violations = response.data;
			$state.go("hans-ui");	
			
		}
		else {
			
			console.log("Problems while contacting the server " + response.status + ": " + response.data);
			$state.go("error");
			
		}
				
	}, function errorCallback(response) {
		
		console.log(response.status);
		console.log("Problems while contacting the server " + response.status);
		$state.go("error");
		
	});

}

function hansInterfaceCtrl($scope, $http, $state, $compile,$interval, Data){
	
	$scope.rules = []
	$scope.noViolation = "#80ff77";
	$scope.violation = "#ff6363";
	
	var patrolBehaviour = {
		"comment":"",
		"description":"Check all the H&S rules in the whole building",
		"rule":"http://data.open.ac.uk/kmi/hans#patrol",
		"target":""
	}
	
	$scope.selectedRule = "";
	
	$scope.statuses = []
	
	// setup the environemnt
	// asking for all rules
	$http({
		
		method: 'GET',
		url: Data.ip + "/query/list/rules"
			
	}).then(function successCallback(response) {
		
		if (response.status == 200) {

			$scope.rules = response.data["results"];
			console.log($scope.rules);
			$scope.rules.push(patrolBehaviour);
			
			angular.forEach($scope.rules,function(rule) {
		
				currentClass = rule["target"];
				
				$http({
		
					method: 'GET',
					url: Data.ip + "/query/list/entities",
					params: {"class":currentClass}
			
				}).then(function successCallback(response) {
					
					angular.forEach(response.data["results"],function(entity) {
						
						_status = {
							"entity":entity,
							"rule":rule,
							"violated":false,
							"entity_violating":[],
							"color":{'background-color':$scope.noViolation},
						}
						
						$scope.statuses.push(_status);
						
					});
					

				},function errorCallback(response) {

					console.log("Problems while getting the list of rules " + response.status + ": " + response.data);

				}); 
		
			});
			
			$interval($scope.validate, 3000, 0, true);
			
		}
		else {
			
			console.log("Problems while getting the list of rules " + response.status + ": " + response.data);
	
		}
			
	},function errorCallback(response) {

		console.log("Problems while getting the list of rules " + response.status + ": " + response.data);

	}); 
	
	$scope.validate = function() {
		
		$http({
		
			method: 'POST',
			url: Data.ip + "/validate"
		
		}).then(function successCallback(response) {
	
			if (response.status == 200) {
			
				var violations = response.data;
				$scope.updateViolationStatus(violations);
			
			}
			else {
			
				console.log("Problems while contacting the server " + response.status + ": " + response.data);
			
			}
				
		}, function errorCallback(response) {
		
			console.log("Problems while contacting the server " + response.status + ": " + response.data);

		});
		
	}
	
	$scope.updateViolationStatus = function(violations){
		
		// clear everything
		if (violations["sh:conforms"]) {
			
			angular.forEach($scope.statuses,function(_status) {
				
				_status["violated"] = false;
				_status["color"]["background-color"] = $scope.noViolation;
				_status["entity_violating"] = [];
				
			});
			
		}
		else {
			
			angular.forEach(violations["violations"],function(violation) {
					
				if (violation["@type"] == "sh:ValidationResult") {
					
					// TODO understand the difference between focusNode and value
					var entityURI = convertNamespace(violation["focusNode"]);
					var message = violation["resultMessage"];
					var value = convertNamespace(violation["value"]);
					
					var alreadyThere = false;
					
					angular.forEach($scope.statuses, function(_status) {
						
						if (_status["entity"].entity == entityURI) {
							
							alreadyThere = true;
							$scope.setViolated(_status);
							
							if (!_status["entity_violating"].includes(message)) {

								_status["entity_violating"].push(message);

							}
						}
					});
					
					if (!alreadyThere) {
						
						var gettingEntity = getEntity(entityURI);
						
						gettingEntity.then(function(data){
							

								
							var entity = data["results"][0];
							var rule = getRule(entity["class"]);
						
							newStatus = {
								"entity":entity,
								"rule":rule,
								"violated":true,
								"entity_violating":[message],
								"color":{'background-color':$scope.violation}
							}
						
							$scope.statuses.push(newStatus);
						
						});
						
					}
				}
			});
			
			// loop over all the statuses, and check whether there is one that is not in the violations
			// make it clear
			// TODO this does not work if there are more rules on the same entity
			angular.forEach($scope.statuses, function(_status){
					
				var curEntity = _status.entity.entity;
				var notInViolations = true;
				
				angular.forEach(violations["violations"],function(violation) {
					
					if (violation["@type"] == "sh:ValidationResult") {
						
						var entityURI = convertNamespace(violation["focusNode"]);

						if (curEntity == entityURI) {
							
							notInViolations = false;
							
						}	
					}
				});
				
				if (notInViolations) {
						
					$scope.setNotViolated(_status);
						
				}					
			});
		}
	}
	
	
	function convertNamespace(uri) {
		
		var ret = uri;
		
		angular.forEach(Data.namespaces, function(long, short) {

			if (uri.startsWith(short + ":")) {
			
				uri = uri.replace(short+":", long);
			
			}
		});
		
		return uri;
		
	}	
	
	
	function getRule(_class) {
		
		angular.forEach($scope.rules, function(rule) {
						
			if (rule["target"] == _class) {
				
				return rule;
				
			}
		});
		
	}
	
	
	function getEntity(uri) {
		
		return $http({
		
			method: 'GET',
			url: Data.ip + "/query/entity",
			params: {"entity_uri":uri}
			
		}).then(function successCallback(response) {
			
			if (response.status == 200) {
				
				return response.data;
				
			}
			
			return null;
			
		}, function errorCallback(response) {
		
			console.log("Problems while contacting the server " + response.status + ": " + response.data);
			return null;
			
		});
		
	}
	
	
	$scope.setViolated = function(_status) {
		
		_status["violated"] = true;
		_status["color"]["background-color"] = $scope.violation;
		
	}
	
	
	$scope.setNotViolated = function(_status) {
		
		_status["violated"] = false;
		_status["color"]["background-color"] = $scope.noViolation;
		
	}
	
	
	$scope.run = function() {
		
		$http({
		
			method: 'POST',
			url: Data.robotIp + "/execute/rule-behaviour",
			data: {"rule":encodeURI($scope.selectedRule["rule"])},
			headers: {
			   'Content-Type': "application/json"
			 },
	
		}).then(function successCallback(response) {
	
			if (response.status == 200) {
		
				console.log("Executing behaviour for rule " + $scope.selectedRule["rule"]);
		
			}
	
		}, function errorCallback(response) {

			console.log("Problems while contacting the server " + response.status + ": " + response.data);
			return null;
	
		});
	
	}
	
}





