var nodes = new vis.DataSet(graphData);

  // create an array with edges
  var edges = new vis.DataSet(graphConnections);

  // create a network
  var container = document.getElementById('typesGraph');
  var data = {
    nodes: nodes,
    edges: edges
  };
  var options = {
    layout: {
        hierarchical: {
            direction: 'LR'
        }
    },
    physics:false,
  };
  var network = new vis.Network(container, data, options);

  network.on("click", function (params) {
      window.location.hash = params.nodes[0];
  });