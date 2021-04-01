import urllib.request

response = urllib.request.urlopen("https://localhost", timeout = 5)
content = response.read()

