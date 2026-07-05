using System;
using System.IO;
using System.Net;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;

namespace PulsePlayerLauncher
{
    class Program
    {
        private static HttpListener listener;
        private static string baseDir;
        private static int port = 3000;

        static void Main(string[] args)
        {
            // Set base directory to the "dist" folder next to the executable
            baseDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dist");
            if (!Directory.Exists(baseDir))
            {
                // Fallback to the executable directory if "dist" folder is missing
                baseDir = AppDomain.CurrentDomain.BaseDirectory;
            }

            // Find a free port
            port = FindFreePort(3000);

            // Start the local HTTP Server
            listener = new HttpListener();
            listener.Prefixes.Add("http://localhost:" + port + "/");
            try
            {
                listener.Start();
                Task.Run(() => ListenLoop());
            }
            catch (Exception ex)
            {
                // Output error to a log file since this is a GUI app (no console)
                File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launcher_error.log"), 
                    "Failed to start local server: " + ex.ToString());
                return;
            }

            string url = "http://localhost:" + port + "/";
            Process edgeProcess = null;
            
            try
            {
                // Launch Microsoft Edge in App Mode (borderless application window)
                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = "msedge.exe",
                    Arguments = "--app=" + url,
                    UseShellExecute = true
                };
                edgeProcess = Process.Start(startInfo);
            }
            catch
            {
                try
                {
                    // Fallback: open default web browser if Edge app mode fails
                    Process.Start(url);
                }
                catch (Exception ex)
                {
                    File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launcher_error.log"), 
                        "Failed to launch browser: " + ex.ToString());
                }
            }

            if (edgeProcess != null)
            {
                // Monitor the Edge window; once the user closes it, shut down the server
                edgeProcess.WaitForExit();
            }
            else
            {
                // If fell back to default browser, keep the server running in background
                // for 4 hours before exiting, or until the machine shuts down.
                Thread.Sleep(4 * 60 * 60 * 1000);
            }

            try
            {
                listener.Stop();
            }
            catch { }
        }

        private static int FindFreePort(int startPort)
        {
            int p = startPort;
            while (p < 65535)
            {
                try
                {
                    System.Net.Sockets.TcpListener l = new System.Net.Sockets.TcpListener(IPAddress.Loopback, p);
                    l.Start();
                    l.Stop();
                    return p;
                }
                catch
                {
                    p++;
                }
            }
            return startPort;
        }

        private static async Task ListenLoop()
        {
            while (listener.IsListening)
            {
                try
                {
                    var context = await listener.GetContextAsync();
                    // Process requests asynchronously on the thread pool
                    Task.Run(() => ProcessRequest(context));
                }
                catch { }
            }
        }

        private static void ProcessRequest(HttpListenerContext context)
        {
            HttpListenerRequest request = context.Request;
            HttpListenerResponse response = context.Response;

            try
            {
                string rawPath = request.Url.LocalPath;
                if (rawPath == "/") rawPath = "/index.html";

                // Map URL to local path
                string filePath = Path.Combine(baseDir, rawPath.Substring(1).Replace('/', Path.DirectorySeparatorChar));

                if (File.Exists(filePath))
                {
                    byte[] buffer = File.ReadAllBytes(filePath);
                    response.ContentLength64 = buffer.Length;
                    response.ContentType = GetContentType(filePath);
                    
                    // Allow CORS
                    response.Headers.Add("Access-Control-Allow-Origin", "*");
                    
                    // Disable caching for dev/updates
                    response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate");

                    response.OutputStream.Write(buffer, 0, buffer.Length);
                }
                else
                {
                    response.StatusCode = 404;
                }
            }
            catch
            {
                response.StatusCode = 500;
            }
            finally
            {
                try
                {
                    response.OutputStream.Close();
                }
                catch { }
            }
        }

        private static string GetContentType(string path)
        {
            string ext = Path.GetExtension(path).ToLower();
            switch (ext)
            {
                case ".html": return "text/html; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".js": return "application/javascript; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".gif": return "image/gif";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".json": return "application/json; charset=utf-8";
                case ".ico": return "image/x-icon";
                default: return "application/octet-stream";
            }
        }
    }
}
