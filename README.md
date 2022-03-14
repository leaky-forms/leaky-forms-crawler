## Crawler
In order to detect email and password exfiltration, we extended **[Tracker Radar Collector(TRC)](https://github.com/duckduckgo/tracker-radar-collector)** by adding EmailPasswordFieldsCollector that finds and fills email and password fields.

In order to investigate the effect of users’ consent preferences, we integrated **[Consent-O-Matic](https://github.com/cavi-au/Consent-O-Matic)** into our crawler.

Lastly, we used the Fathom-based email field detector model used in **[Firefox Relay](https://github.com/mozilla/fx-private-relay/blob/v1.2.2/extension/js/email_detector.js)**  add-on.

### Installation
- Clone this project locally (`git clone git@github.com:asumansenol/leaky-forms.git`)
- Install all dependencies (`npm i`)
- Run the command line tool:

```sh
npm run crawl -- -u "https://example.com" -o ./data/ -v -d "emailPasswordFields,requests,cookies,targets,apis," -e "test_email_address@gmail.com" -w "myPassword111111"
```

### Command line parameters
Below we give a description of the parameters that are passed to the crawler.

- `-o, --output <path>` - (required) output folder where output files will be created
- `-u, --url <url>` - single URL to crawl
- `-i, --input-list <path>` - path to a text file with list of URLs to crawl (each in a separate line)
- `-d, --data-collectors <list>` - comma separated list (e.g `-d 'requests,cookies'`) of data collectors that should be used (all by default)
- `-c, --crawlers <number>` - override the default number of concurrent crawlers (default number is picked based on the number of CPU cores)
- `--reporters <list>` - comma separated list (e.g. `--reporters 'cli,file,html'`) of reporters to be used ('cli' by default)
- `-v, --verbose` - instructs reporters to log additional information (e.g. for "cli" reporter progress bar will not be shown when verbose logging is enabled)
- `-l, --log-path <path>` - instructs reporters where all logs should be written to
- `-f, --force-overwrite` - overwrite existing output files (by default entries with existing output files are skipped)
- `-3, --only-3p` - don't save any first-party data (e.g. requests, API calls for the same eTLD+1 as the main document)
- `-m, --mobile` - emulate a mobile device when crawling
- `-p, --proxy-config <host>` - optional SOCKS proxy host
- `-r, --region-code <region>` - optional 2 letter region code. For metadata only
- `-a, --disable-anti-bot` - disable simple build-in anti bot detection script injected to every frame
- `--chromium-version <version_number>` - use custom version of Chromium (e.g. "843427") instead of using the default
- `--config <path>` - path to a config file that allows to set all the above settings (and more). Note that CLI flags have a higher priority than settings passed via config. You can find a sample config file in `tests/cli/sampleConfig.json`.
- `-e, --email-address` - email address that will be filled
- `-w, --password` - password that will be filled

### Crawl setup
To crawl 100K websites, we needed to split URLs into the lists containing 1K webistes in crux_urls filder due to the an issue on the TRC. That's why if you need to run crawl for more than 100K websites you can use the shell scripts crawl_in_parts.sh for the desktop and crawl_in_parts_mobile.sh for the mobile. These shell scripts waits for 6 arguments that you need to pass like the output folder name, email address that will be filled by the crawler etc.

### After the crawl
Crawler will store the data about the crawls in the directory that you passed the crawler. Crawler outputs are JSONs, log, PNGs and HTMLs. The HTML and PNGs can be used for the debugging but the JSONs and the log file will be used for the leak detection.