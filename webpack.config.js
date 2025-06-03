const path = require("path")
//const webpack = require('webpack')
//const HtmlWebPackPlugin = require("html-webpack-plugin")
module.exports = {
  entry: {
    main: './server.js'
  },
  output: {
    path: path.join(__dirname, 'dist'),
    publicPath: '/',
    filename: '[name].js'
  },
  target: 'node',
  node: {
    __dirname: true
  },
 // devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: "babel-loader",
      },
      
    //   {
    //     test: /\.js$|jsx/,
    //     loader: 'url-loader'
    //   },
      // {
      //   // Loads the javacript into html template provided.
      //   // Entry point is set below in HtmlWebPackPlugin in Plugins 
      //   test: /\.html$/,
      //   use: [
      //     {
      //       loader: "html-loader",
      //       //options: { minimize: true }
      //     }
      //   ]
      // },
      // {
      //   test: /\.css$/,
      //   use: [ 'style-loader', 'css-loader' ]
      // },
      {
       test: /\.(png|svg|jpg|gif)$/,
       use: ['file-loader']
      }
    ]
  },
  // plugins: [
  //   new HtmlWebPackPlugin({
  //     template: "./src/html/index.html",
  //     filename: "./index.html",
  //     excludeChunks: [ 'server' ]
  //   })
  // ]
}
